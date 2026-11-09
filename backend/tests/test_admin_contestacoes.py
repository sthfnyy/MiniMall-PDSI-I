import asyncio
import copy
import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import StatusContestacaoCompra, StatusIntencaoCompra, UserRole
from backend.services.contestation_storage import (
    ContestationStorageError,
    get_contestation_storage,
)


PNG = b"\x89PNG\r\n\x1a\nevidencia"
NOW = datetime(2026, 11, 9, 12, tzinfo=UTC)


class FakeResult:
    def __init__(self, scalar=None, rows=None, row=None, scalars=None):
        self.scalar = scalar
        self.rows = list(rows or [])
        self.row = row
        self._scalars = list(scalars or [])

    def scalar_one_or_none(self):
        return self.scalar

    def one_or_none(self):
        return self.row

    def all(self):
        return self.rows

    def scalars(self):
        return SimpleNamespace(all=lambda: self._scalars)


class FakeSession:
    def __init__(self, results=(), commit_error=None):
        self.results = list(results)
        self.statements = []
        self.committed = False
        self.rolled_back = False
        self.commit_error = commit_error

    async def execute(self, statement):
        self.statements.append(statement)
        if not self.results:
            raise AssertionError("Resultado falso não configurado")
        return self.results.pop(0)

    async def commit(self):
        if self.commit_error is not None:
            raise self.commit_error
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


class FakeStorage:
    def __init__(self, error=False):
        self.error = error
        self.downloaded = []

    async def download(self, path):
        self.downloaded.append(path)
        if self.error:
            raise ContestationStorageError("Não foi possível obter a evidência")
        return PNG, "application/octet-stream"


def profile(role=UserRole.admin):
    return SimpleNamespace(id=uuid.uuid4(), role=role, nome_completo="Admin")


def make_contestation(state=StatusContestacaoCompra.aguardando_analise, **extra):
    data = dict(
        id=uuid.uuid4(),
        intencao_id=uuid.uuid4(),
        consumidor_id=uuid.uuid4(),
        motivo="Realizei a compra e tenho o comprovante.",
        status=state,
        criado_em=NOW,
        decidido_em=None,
        decidido_por=None,
        observacao_admin=None,
    )
    data.update(extra)
    return SimpleNamespace(**data)


def make_intent(contestation):
    return SimpleNamespace(
        id=contestation.intencao_id,
        codigo="MM-8F42",
        status=StatusIntencaoCompra.compra_nao_reconhecida,
        criado_em=NOW,
        decidido_em=NOW,
        decidido_por=uuid.uuid4(),
        produto_id=uuid.uuid4(),
        loja_id=uuid.uuid4(),
    )


def make_evidence(contestation_id):
    return SimpleNamespace(
        id=uuid.uuid4(),
        contestacao_id=contestation_id,
        storage_path=f"user/{contestation_id}/arquivo.png",
        nome_arquivo="comprovante.png",
        tipo_mime="image/png",
        tamanho_bytes=len(PNG),
        criado_em=NOW,
    )


def detail_results(contestation, evidences=(), admin_name=None):
    intent = make_intent(contestation)
    row = (
        contestation,
        intent,
        "Produto Teste",
        "Loja Teste",
        "Consumidor Teste",
        "Lojista Teste",
        admin_name,
    )
    return [FakeResult(row=row), FakeResult(scalars=list(evidences))]


class AdminContestacoesBase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def authenticate(self, current_profile, session, storage=None):
        async def override_profile():
            return current_profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db
        if storage is not None:
            app.dependency_overrides[get_contestation_storage] = lambda: storage


class AutorizacaoTestCase(AdminContestacoesBase):
    def endpoints(self):
        cid, eid = uuid.uuid4(), uuid.uuid4()
        return [
            ("get", "/admin/contestacoes", None),
            ("get", f"/admin/contestacoes/{cid}", None),
            ("get", f"/admin/contestacoes/{cid}/evidencias/{eid}", None),
            ("patch", f"/admin/contestacoes/{cid}", {"status": "aprovada"}),
        ]

    def call(self, method, url, body):
        if body is None:
            return getattr(self.client, method)(url)
        return getattr(self.client, method)(url, json=body)

    def test_sem_jwt_retorna_401(self):
        for method, url, body in self.endpoints():
            with self.subTest(url=url, method=method):
                self.assertEqual(self.call(method, url, body).status_code, 401)

    def test_consumidor_e_lojista_retornam_403(self):
        for role in (UserRole.consumidor, UserRole.lojista):
            session = FakeSession()
            storage = FakeStorage()
            self.authenticate(profile(role), session, storage)
            for method, url, body in self.endpoints():
                with self.subTest(role=role, url=url, method=method):
                    self.assertEqual(self.call(method, url, body).status_code, 403)
            self.assertEqual(session.statements, [])
            self.assertEqual(storage.downloaded, [])


class ListagemTestCase(AdminContestacoesBase):
    def row(self, state=StatusContestacaoCompra.aguardando_analise):
        return (uuid.uuid4(), "MM-8F42", "Consumidor", "Loja", "Produto", state, NOW, None)

    def test_admin_lista_contestacoes(self):
        session = FakeSession([FakeResult(rows=[self.row()])])
        self.authenticate(profile(), session)
        response = self.client.get("/admin/contestacoes")
        self.assertEqual(response.status_code, 200)
        item = response.json()[0]
        self.assertEqual(
            set(item),
            {
                "id", "codigo", "consumidor_nome", "loja_nome", "produto_nome",
                "status", "criado_em", "decidido_em",
            },
        )
        self.assertEqual(item["codigo"], "MM-8F42")
        self.assertIsNone(item["decidido_em"])

    def test_filtro_pendente_usa_fila_fifo(self):
        session = FakeSession([FakeResult(rows=[self.row()])])
        self.authenticate(profile(), session)
        response = self.client.get("/admin/contestacoes?status_filtro=aguardando_analise")
        self.assertEqual(response.status_code, 200)
        sql = str(session.statements[0])
        self.assertIn("contestacoes_compra.status = ", sql)
        self.assertIn("ORDER BY contestacoes_compra.criado_em ASC", sql)

    def test_filtros_decididos_usam_ordem_decrescente(self):
        for state in ("aprovada", "reprovada"):
            session = FakeSession([FakeResult(rows=[])])
            self.authenticate(profile(), session)
            response = self.client.get(f"/admin/contestacoes?status_filtro={state}")
            self.assertEqual(response.status_code, 200)
            self.assertIn("ORDER BY contestacoes_compra.criado_em DESC", str(session.statements[0]))

    def test_status_invalido_retorna_422(self):
        self.authenticate(profile(), FakeSession())
        response = self.client.get("/admin/contestacoes?status_filtro=compra_confirmada")
        self.assertEqual(response.status_code, 422)

    def test_lista_vazia(self):
        self.authenticate(profile(), FakeSession([FakeResult(rows=[])]))
        response = self.client.get("/admin/contestacoes")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class DetalheTestCase(AdminContestacoesBase):
    def test_detalhe_completo_sem_dados_sensiveis(self):
        contestation = make_contestation()
        evidence = make_evidence(contestation.id)
        session = FakeSession(detail_results(contestation, [evidence]))
        self.authenticate(profile(), session)
        response = self.client.get(f"/admin/contestacoes/{contestation.id}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "aguardando_analise")
        self.assertEqual(body["motivo"], contestation.motivo)
        self.assertIsNone(body["decidido_por"])
        self.assertEqual(body["intencao"]["codigo"], "MM-8F42")
        self.assertEqual(body["intencao"]["status"], "compra_nao_reconhecida")
        self.assertEqual(body["intencao"]["decidido_por"]["nome"], "Lojista Teste")
        self.assertEqual(body["produto"]["titulo"], "Produto Teste")
        self.assertEqual(body["loja"]["nome"], "Loja Teste")
        self.assertEqual(body["consumidor"]["nome"], "Consumidor Teste")
        self.assertEqual(body["evidencias"][0]["nome_arquivo"], "comprovante.png")
        self.assertEqual(body["evidencias"][0]["tipo_mime"], "image/png")
        raw = response.text
        for forbidden in ("storage_path", "telefone", "email", "whatsapp", "endereco"):
            self.assertNotIn(forbidden, raw)

    def test_contestacao_inexistente_retorna_404(self):
        self.authenticate(profile(), FakeSession([FakeResult(row=None)]))
        response = self.client.get(f"/admin/contestacoes/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 404)


class EvidenciaTestCase(AdminContestacoesBase):
    def url(self, contestation_id, evidence_id):
        return f"/admin/contestacoes/{contestation_id}/evidencias/{evidence_id}"

    def test_admin_baixa_evidencia_pelo_proxy(self):
        contestation_id = uuid.uuid4()
        evidence = make_evidence(contestation_id)
        storage = FakeStorage()
        session = FakeSession([FakeResult(scalar=evidence)])
        self.authenticate(profile(), session, storage)
        response = self.client.get(self.url(contestation_id, evidence.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, PNG)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertTrue(response.headers["content-disposition"].startswith("inline"))
        self.assertEqual(response.headers["cache-control"], "no-store, private")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(storage.downloaded, [evidence.storage_path])
        sql = str(session.statements[0])
        self.assertIn("contestacao_compra_evidencias.id = ", sql)
        self.assertIn("contestacao_compra_evidencias.contestacao_id = ", sql)

    def test_evidencia_de_outra_contestacao_retorna_404(self):
        storage = FakeStorage()
        self.authenticate(profile(), FakeSession([FakeResult(scalar=None)]), storage)
        response = self.client.get(self.url(uuid.uuid4(), uuid.uuid4()))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(storage.downloaded, [])

    def test_falha_do_storage_retorna_502(self):
        contestation_id = uuid.uuid4()
        evidence = make_evidence(contestation_id)
        self.authenticate(
            profile(),
            FakeSession([FakeResult(scalar=evidence)]),
            FakeStorage(error=True),
        )
        response = self.client.get(self.url(contestation_id, evidence.id))
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("storage_path", response.text)
        self.assertNotIn(evidence.storage_path, response.text)


class DecisaoTestCase(AdminContestacoesBase):
    def decide(self, contestation, payload, admin=None, commit_error=None):
        admin = admin or profile()
        session = FakeSession(
            [FakeResult(scalar=contestation), *detail_results(contestation, admin_name="Admin")],
            commit_error=commit_error,
        )
        self.authenticate(admin, session)
        response = self.client.patch(f"/admin/contestacoes/{contestation.id}", json=payload)
        return response, session, admin

    def test_admin_aprova_e_registra_auditoria(self):
        contestation = make_contestation()
        intent_status_before = StatusIntencaoCompra.compra_nao_reconhecida
        response, session, admin = self.decide(contestation, {"status": "aprovada"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(contestation.status, StatusContestacaoCompra.aprovada)
        self.assertEqual(contestation.decidido_por, admin.id)
        self.assertIsNotNone(contestation.decidido_em)
        self.assertIsNone(contestation.observacao_admin)
        self.assertTrue(session.committed)
        body = response.json()
        self.assertEqual(body["status"], "aprovada")
        self.assertEqual(body["decidido_por"], {"id": str(admin.id), "nome": "Admin"})
        self.assertIsNotNone(body["decidido_em"])
        self.assertEqual(body["intencao"]["status"], intent_status_before.value)
        self.assertIsNotNone(session.statements[0]._for_update_arg)

    def test_admin_aprova_com_observacao_opcional(self):
        contestation = make_contestation()
        response, _, _ = self.decide(
            contestation, {"status": "aprovada", "observacao_admin": "  Comprovante válido  "}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(contestation.observacao_admin, "Comprovante válido")

    def test_admin_reprova_com_observacao(self):
        contestation = make_contestation()
        response, session, admin = self.decide(
            contestation, {"status": "reprovada", "observacao_admin": "Comprovante ilegível"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(contestation.status, StatusContestacaoCompra.reprovada)
        self.assertEqual(contestation.observacao_admin, "Comprovante ilegível")
        self.assertEqual(contestation.decidido_por, admin.id)
        self.assertIsNotNone(contestation.decidido_em)
        self.assertTrue(session.committed)

    def test_reprovacao_exige_observacao(self):
        for payload in (
            {"status": "reprovada"},
            {"status": "reprovada", "observacao_admin": None},
            {"status": "reprovada", "observacao_admin": "   "},
            {"status": "reprovada", "observacao_admin": "ok"},
            {"status": "reprovada", "observacao_admin": "x" * 1001},
        ):
            with self.subTest(payload=str(payload)[:60]):
                session = FakeSession()
                self.authenticate(profile(), session)
                response = self.client.patch(f"/admin/contestacoes/{uuid.uuid4()}", json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(session.statements, [])

    def test_payload_rejeita_campos_extras_e_status_invalidos(self):
        for payload in (
            {"status": "aprovada", "decidido_por": str(uuid.uuid4())},
            {"status": "aprovada", "decidido_em": NOW.isoformat()},
            {"status": "aprovada", "consumidor_id": str(uuid.uuid4())},
            {"status": "aprovada", "intencao_id": str(uuid.uuid4())},
            {"status": "aprovada", "motivo": "alterado"},
            {"status": "aguardando_analise"},
            {"status": "compra_confirmada"},
            {},
        ):
            with self.subTest(payload=payload):
                session = FakeSession()
                self.authenticate(profile(), session)
                response = self.client.patch(f"/admin/contestacoes/{uuid.uuid4()}", json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(session.statements, [])

    def test_contestacao_inexistente_retorna_404(self):
        session = FakeSession([FakeResult(scalar=None)])
        self.authenticate(profile(), session)
        response = self.client.patch(
            f"/admin/contestacoes/{uuid.uuid4()}", json={"status": "aprovada"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertTrue(session.rolled_back)

    def test_contestacao_ja_decidida_retorna_409(self):
        transitions = [
            (StatusContestacaoCompra.aprovada, "aprovada"),
            (StatusContestacaoCompra.reprovada, "reprovada"),
            (StatusContestacaoCompra.aprovada, "reprovada"),
            (StatusContestacaoCompra.reprovada, "aprovada"),
        ]
        for current, target in transitions:
            with self.subTest(current=current, target=target):
                decided_by = uuid.uuid4()
                contestation = make_contestation(
                    current,
                    decidido_por=decided_by,
                    decidido_em=NOW,
                    observacao_admin="Decisão anterior",
                )
                response, session, _ = self.decide(
                    contestation, {"status": target, "observacao_admin": "Nova decisão"}
                )
                self.assertEqual(response.status_code, 409)
                self.assertEqual(contestation.status, current)
                self.assertEqual(contestation.decidido_por, decided_by)
                self.assertEqual(contestation.observacao_admin, "Decisão anterior")
                self.assertFalse(session.committed)
                self.assertTrue(session.rolled_back)

    def test_bloqueio_do_banco_retorna_409(self):
        contestation = make_contestation()
        error = IntegrityError("update", {}, Exception("decisão definitiva"))
        response, session, _ = self.decide(contestation, {"status": "aprovada"}, commit_error=error)
        self.assertEqual(response.status_code, 409)
        self.assertTrue(session.rolled_back)


class LockingDatabase:
    """Simula a linha de contestação com bloqueio de SELECT ... FOR UPDATE."""

    def __init__(self, contestation):
        self.row = contestation
        self.lock = asyncio.Lock()


class LockingSession:
    def __init__(self, database):
        self.database = database
        self.locked = None

    async def execute(self, statement):
        if getattr(statement, "_for_update_arg", None) is not None:
            await self.database.lock.acquire()
            # Latência simulada: sem o bloqueio, as duas requisições leriam "pendente".
            await asyncio.sleep(0.05)
            self.locked = copy.copy(self.database.row)
            return FakeResult(scalar=self.locked)
        if isinstance(statement, str):
            raise AssertionError("Consulta inesperada")
        return FakeResult(
            row=(
                self.database.row,
                make_intent(self.database.row),
                "Produto", "Loja", "Consumidor", "Lojista", "Admin",
            ),
            scalars=[],
        )

    def _release(self):
        if self.database.lock.locked() and self.locked is not None:
            self.locked = None
            self.database.lock.release()

    async def commit(self):
        await asyncio.sleep(0.05)
        self.database.row = self.locked
        self._release()

    async def rollback(self):
        self._release()


class ConcorrenciaTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        app.dependency_overrides.clear()

    async def test_decisoes_simultaneas_uma_vence_outra_recebe_409(self):
        database = LockingDatabase(make_contestation())
        admin = profile()

        async def override_profile():
            return admin

        async def override_db():
            yield LockingSession(database)

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            url = f"/admin/contestacoes/{database.row.id}"
            responses = await asyncio.gather(
                client.patch(url, json={"status": "aprovada"}),
                client.patch(url, json={"status": "reprovada", "observacao_admin": "Sem prova"}),
            )

        codes = sorted(response.status_code for response in responses)
        self.assertEqual(codes, [200, 409])
        winner = next(response for response in responses if response.status_code == 200)
        self.assertEqual(database.row.status.value, winner.json()["status"])
        self.assertEqual(database.row.decidido_por, admin.id)


if __name__ == "__main__":
    unittest.main()
