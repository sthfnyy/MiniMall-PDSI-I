import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import StatusIntencaoCompra, UserRole


class FakeResult:
    def __init__(self, scalar=None):
        self.scalar = scalar

    def scalar_one_or_none(self):
        return self.scalar


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.statements = []
        self.added = []
        self.committed = False

    async def execute(self, statement):
        self.statements.append(statement)
        return self.results.pop(0)

    def add(self, instance):
        self.added.append(instance)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass


def profile_consumidor():
    return SimpleNamespace(
        id=uuid.uuid4(),
        role=UserRole.consumidor,
        nome_completo="Consumidor",
    )


def produto(loja_id=None):
    return SimpleNamespace(id=uuid.uuid4(), loja_id=loja_id or uuid.uuid4())


class ConsumerIntencoesCompraTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, session, profile=None):
        profile = profile or profile_consumidor()

        async def override_profile():
            return profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db
        return profile

    def publicar(self, session, item, loja_id, profile=None):
        profile = self.autenticar(session, profile)
        with patch(
            "backend.controllers.consumer_intencoes_compra.secrets.token_hex",
            return_value="8f42",
        ):
            response = self.client.post(
                "/consumidor/intencoes-compra",
                json={"produto_id": str(item.id), "loja_id": str(loja_id)},
            )
        return response, profile

    def test_cria_intencao_com_consumidor_autenticado(self):
        loja_id = uuid.uuid4()
        item = produto(loja_id)
        session = FakeSession([
            FakeResult(item),
            FakeResult(SimpleNamespace(id=loja_id)),
            FakeResult(None),
        ])

        response, _ = self.publicar(session, item, loja_id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["produto_id"], str(item.id))
        self.assertEqual(response.json()["loja_id"], str(loja_id))
        self.assertNotIn("consumidor_id", response.json())
        self.assertTrue(session.committed)

    def test_persiste_consumidor_autenticado_codigo_e_status_inicial(self):
        loja_id = uuid.uuid4()
        item = produto(loja_id)
        session = FakeSession([
            FakeResult(item),
            FakeResult(SimpleNamespace(id=loja_id)),
            FakeResult(None),
        ])

        response, profile = self.publicar(session, item, loja_id)
        saved = session.added[0]

        self.assertEqual(saved.consumidor_id, profile.id)
        self.assertEqual(saved.codigo, "MM-8F42")
        self.assertEqual(saved.status, StatusIntencaoCompra.contato_realizado)
        self.assertEqual(response.json()["codigo"], "MM-8F42")
        self.assertEqual(response.json()["status"], "contato_realizado")

    def test_sem_autenticacao_retorna_401(self):
        response = self.client.post(
            "/consumidor/intencoes-compra",
            json={"produto_id": str(uuid.uuid4()), "loja_id": str(uuid.uuid4())},
        )
        self.assertEqual(response.status_code, 401)

    def test_produto_inexistente_retorna_404(self):
        session = FakeSession([FakeResult(None)])
        item = produto()
        response, _ = self.publicar(session, item, uuid.uuid4())
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Produto não encontrado")

    def test_loja_inexistente_retorna_404(self):
        item = produto()
        session = FakeSession([FakeResult(item), FakeResult(None)])
        response, _ = self.publicar(session, item, uuid.uuid4())
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Loja não encontrada")

    def test_produto_de_outra_loja_retorna_422(self):
        item = produto()
        outra_loja_id = uuid.uuid4()
        session = FakeSession([
            FakeResult(item),
            FakeResult(SimpleNamespace(id=outra_loja_id)),
        ])
        response, _ = self.publicar(session, item, outra_loja_id)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "O produto não pertence à loja informada")
        self.assertEqual(session.added, [])

    def test_rejeita_consumidor_id_no_payload(self):
        session = FakeSession([])
        self.autenticar(session)
        response = self.client.post(
            "/consumidor/intencoes-compra",
            json={
                "produto_id": str(uuid.uuid4()),
                "loja_id": str(uuid.uuid4()),
                "consumidor_id": str(uuid.uuid4()),
            },
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
