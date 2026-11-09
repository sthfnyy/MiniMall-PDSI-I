import asyncio
import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient
from fastapi import HTTPException

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.controllers.lojista_intencoes_compra import decidir_intencao_compra
from backend.main import app
from backend.models import StatusIntencaoCompra, UserRole
from backend.schemas import LojistaIntencaoCompraUpdate


class FakeResult:
    def __init__(self, scalar=None, rows=None):
        self.scalar = scalar
        self.rows = list(rows or [])

    def scalar_one_or_none(self):
        return self.scalar

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.statements = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, statement):
        self.statements.append(statement)
        if not self.results:
            raise AssertionError("Resultado falso não configurado")
        return self.results.pop(0)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


def profile(role=UserRole.lojista, profile_id=None):
    return SimpleNamespace(
        id=profile_id or uuid.uuid4(),
        role=role,
        nome_completo="Lojista",
    )


def loja(owner_id=None, loja_id=None):
    return SimpleNamespace(
        id=loja_id or uuid.uuid4(),
        lojista_id=owner_id or uuid.uuid4(),
    )


def intencao(loja_id, status=StatusIntencaoCompra.contato_realizado):
    return SimpleNamespace(
        id=uuid.uuid4(),
        codigo="MM-8F42",
        consumidor_id=uuid.uuid4(),
        loja_id=loja_id,
        produto_id=uuid.uuid4(),
        status=status,
        criado_em=datetime(2026, 11, 9, 12, 0, tzinfo=UTC),
        decidido_em=None,
        decidido_por=None,
    )


class LojistaIntencoesCompraTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, current_profile, session):
        async def override_profile():
            return current_profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db

    def test_sem_jwt_retorna_401(self):
        response = self.client.get("/lojista/intencoes-compra")
        self.assertEqual(response.status_code, 401)

    def test_consumidor_retorna_403(self):
        session = FakeSession()
        self.autenticar(profile(UserRole.consumidor), session)
        response = self.client.get("/lojista/intencoes-compra")
        self.assertEqual(response.status_code, 403)

    def test_consumidor_nao_consegue_decidir_intencao(self):
        session = FakeSession()
        self.autenticar(profile(UserRole.consumidor), session)
        response = self.client.patch(
            f"/lojista/intencoes-compra/{uuid.uuid4()}",
            json={"status": "compra_confirmada"},
        )
        self.assertEqual(response.status_code, 403)

    def test_lista_produto_consumidor_codigo_status_e_datas(self):
        merchant = profile()
        merchant_store = loja(merchant.id)
        intent = intencao(merchant_store.id)
        session = FakeSession([
            FakeResult(scalar=merchant_store),
            FakeResult(rows=[(intent, "Camisa Azul", "Consumidora")]),
        ])
        self.autenticar(merchant, session)

        response = self.client.get("/lojista/intencoes-compra")

        self.assertEqual(response.status_code, 200)
        item = response.json()[0]
        self.assertEqual(item["codigo"], "MM-8F42")
        self.assertEqual(item["produto"]["titulo"], "Camisa Azul")
        self.assertEqual(item["consumidor"]["nome"], "Consumidora")
        self.assertEqual(item["status"], "contato_realizado")
        self.assertIsNotNone(item["criado_em"])
        self.assertIsNone(item["decidido_em"])
        query = session.statements[1]
        self.assertIn(merchant_store.id, query.compile().params.values())

    def test_loja_sem_intencoes_retorna_lista_vazia(self):
        merchant = profile()
        merchant_store = loja(merchant.id)
        session = FakeSession([
            FakeResult(scalar=merchant_store),
            FakeResult(rows=[]),
        ])
        self.autenticar(merchant, session)
        response = self.client.get("/lojista/intencoes-compra")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_cada_lojista_filtra_pela_propria_loja(self):
        for _ in range(2):
            merchant = profile()
            merchant_store = loja(merchant.id)
            intent = intencao(merchant_store.id)
            session = FakeSession([
                FakeResult(scalar=merchant_store),
                FakeResult(rows=[(intent, "Produto", "Consumidor")]),
            ])
            self.autenticar(merchant, session)
            response = self.client.get("/lojista/intencoes-compra")
            self.assertEqual(response.json()[0]["loja_id"], str(merchant_store.id))
            self.assertIn(merchant_store.id, session.statements[1].compile().params.values())
            app.dependency_overrides.clear()

    def decidir(self, new_status, current_status=StatusIntencaoCompra.contato_realizado):
        merchant = profile()
        merchant_store = loja(merchant.id)
        intent = intencao(merchant_store.id, current_status)
        session = FakeSession([
            FakeResult(scalar=merchant_store),
            FakeResult(scalar=intent),
        ])
        self.autenticar(merchant, session)
        response = self.client.patch(
            f"/lojista/intencoes-compra/{intent.id}",
            json={"status": new_status},
        )
        return response, merchant, merchant_store, intent, session

    def test_confirma_compra_e_preenche_decisao(self):
        response, merchant, _, intent, session = self.decidir("compra_confirmada")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(intent.status, StatusIntencaoCompra.compra_confirmada)
        self.assertEqual(intent.decidido_por, merchant.id)
        self.assertIsNotNone(intent.decidido_em)
        self.assertTrue(session.committed)
        self.assertIn("FOR UPDATE", str(session.statements[1]))

    def test_registra_compra_nao_reconhecida(self):
        response, _, _, intent, _ = self.decidir("compra_nao_reconhecida")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(intent.status, StatusIntencaoCompra.compra_nao_reconhecida)

    def test_intencao_de_outra_loja_retorna_404(self):
        merchant = profile()
        merchant_store = loja(merchant.id)
        other_intent_id = uuid.uuid4()
        session = FakeSession([
            FakeResult(scalar=merchant_store),
            FakeResult(scalar=None),
        ])
        self.autenticar(merchant, session)
        response = self.client.patch(
            f"/lojista/intencoes-compra/{other_intent_id}",
            json={"status": "compra_confirmada"},
        )
        self.assertEqual(response.status_code, 404)
        params = session.statements[1].compile().params.values()
        self.assertIn(other_intent_id, params)
        self.assertIn(merchant_store.id, params)

    def test_status_arbitrario_e_loja_id_sao_rejeitados(self):
        merchant = profile()
        for payload in (
            {"status": "contato_realizado"},
            {"status": "compra_confirmada", "loja_id": str(uuid.uuid4())},
        ):
            session = FakeSession([FakeResult(scalar=loja(merchant.id))])
            self.autenticar(merchant, session)
            response = self.client.patch(
                f"/lojista/intencoes-compra/{uuid.uuid4()}",
                json=payload,
            )
            self.assertEqual(response.status_code, 422)

    def test_intencao_ja_decidida_retorna_409(self):
        response, _, _, _, session = self.decidir(
            "compra_nao_reconhecida",
            StatusIntencaoCompra.compra_confirmada,
        )
        self.assertEqual(response.status_code, 409)
        self.assertFalse(session.committed)

    def test_segunda_decisao_nao_altera_intencao(self):
        merchant = profile()
        merchant_store = loja(merchant.id)
        intent = intencao(merchant_store.id)

        first_session = FakeSession([
            FakeResult(scalar=merchant_store),
            FakeResult(scalar=intent),
        ])
        self.autenticar(merchant, first_session)
        first = self.client.patch(
            f"/lojista/intencoes-compra/{intent.id}",
            json={"status": "compra_confirmada"},
        )
        self.assertEqual(first.status_code, 200)

        second_session = FakeSession([
            FakeResult(scalar=merchant_store),
            FakeResult(scalar=intent),
        ])
        self.autenticar(merchant, second_session)
        second = self.client.patch(
            f"/lojista/intencoes-compra/{intent.id}",
            json={"status": "compra_nao_reconhecida"},
        )
        self.assertEqual(second.status_code, 409)
        self.assertEqual(intent.status, StatusIntencaoCompra.compra_confirmada)

    def test_decisoes_concorrentes_so_permitem_uma_alteracao(self):
        merchant = profile()
        merchant_store = loja(merchant.id)
        intent = intencao(merchant_store.id)

        class LockedSession:
            def __init__(self, lock):
                self.lock = lock
                self.has_lock = False

            async def execute(self, statement):
                await self.lock.acquire()
                self.has_lock = True
                return FakeResult(scalar=intent)

            async def commit(self):
                if self.has_lock:
                    self.has_lock = False
                    self.lock.release()

            async def rollback(self):
                if self.has_lock:
                    self.has_lock = False
                    self.lock.release()

        async def run_competing_decisions():
            lock = asyncio.Lock()

            async def decide(new_status):
                try:
                    result = await decidir_intencao_compra(
                        intent.id,
                        LojistaIntencaoCompraUpdate(status=new_status),
                        merchant,
                        merchant_store,
                        LockedSession(lock),
                    )
                    return result.status
                except HTTPException as error:
                    return error.status_code

            return await asyncio.gather(
                decide("compra_confirmada"),
                decide("compra_nao_reconhecida"),
            )

        results = asyncio.run(run_competing_decisions())
        self.assertIn(StatusIntencaoCompra.compra_confirmada, results)
        self.assertIn(409, results)
        self.assertEqual(intent.status, StatusIntencaoCompra.compra_confirmada)


if __name__ == "__main__":
    unittest.main()
