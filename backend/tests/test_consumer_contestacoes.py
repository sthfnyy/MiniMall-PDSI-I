import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import StatusContestacaoCompra, StatusIntencaoCompra, UserRole
from backend.services.contestation_storage import get_contestation_storage


JPEG = b"\xff\xd8\xffevidencia"


class FakeResult:
    def __init__(self, scalar=None, rows=None):
        self.scalar = scalar
        self.rows = list(rows or [])

    def scalar_one_or_none(self):
        return self.scalar

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, results=()):
        self.results = list(results)
        self.added = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, statement):
        if not self.results:
            raise AssertionError("Resultado falso não configurado")
        return self.results.pop(0)

    def add(self, item):
        self.added.append(item)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


class FakeStorage:
    def __init__(self):
        self.uploaded = []
        self.removed = []

    async def upload(self, path, content, content_type):
        self.uploaded.append((path, content, content_type))

    async def remove(self, path):
        self.removed.append(path)


def profile(role=UserRole.consumidor, profile_id=None):
    return SimpleNamespace(id=profile_id or uuid.uuid4(), role=role)


def intent(consumer_id, state=StatusIntencaoCompra.compra_nao_reconhecida):
    return SimpleNamespace(
        id=uuid.uuid4(),
        consumidor_id=consumer_id,
        loja_id=uuid.uuid4(),
        produto_id=uuid.uuid4(),
        codigo="MM-8F42",
        status=state,
        criado_em=datetime(2026, 11, 9, tzinfo=UTC),
        decidido_em=datetime(2026, 11, 9, tzinfo=UTC),
    )


class ConsumerContestacoesTestCase(unittest.TestCase):
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

    def post(self, intent_id, data=None, files=None):
        return self.client.post(
            f"/consumidor/intencoes-compra/{intent_id}/contestacao",
            data=data or {"motivo": "Realizei a compra e tenho comprovante."},
            files=files,
        )

    def test_sem_jwt_retorna_401(self):
        response = self.client.get("/consumidor/intencoes-compra")
        self.assertEqual(response.status_code, 401)

    def test_usuario_nao_consumidor_retorna_403(self):
        self.authenticate(profile(UserRole.lojista), FakeSession())
        response = self.post(uuid.uuid4())
        self.assertEqual(response.status_code, 403)

    def test_lista_somente_intencoes_do_consumidor_com_contestacao(self):
        consumer = profile()
        own_intent = intent(consumer.id)
        contestation = SimpleNamespace(
            id=uuid.uuid4(),
            status=StatusContestacaoCompra.aguardando_analise,
        )
        session = FakeSession([
            FakeResult(rows=[(own_intent, "Produto", "Loja", contestation)]),
        ])
        self.authenticate(consumer, session)
        response = self.client.get("/consumidor/intencoes-compra")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["contestacao"]["status"], "aguardando_analise")

    def test_intencao_de_outro_consumidor_retorna_404(self):
        consumer = profile()
        session = FakeSession([FakeResult(scalar=None)])
        self.authenticate(consumer, session, FakeStorage())
        response = self.post(uuid.uuid4())
        self.assertEqual(response.status_code, 404)

    def test_estados_nao_contestaveis_retornam_409(self):
        for state in (
            StatusIntencaoCompra.contato_realizado,
            StatusIntencaoCompra.compra_confirmada,
        ):
            consumer = profile()
            session = FakeSession([FakeResult(scalar=intent(consumer.id, state))])
            self.authenticate(consumer, session, FakeStorage())
            self.assertEqual(self.post(uuid.uuid4()).status_code, 409)

    def test_cria_contestacao_com_consumidor_do_jwt_e_status_inicial(self):
        consumer = profile()
        own_intent = intent(consumer.id)
        storage = FakeStorage()
        session = FakeSession([FakeResult(scalar=own_intent), FakeResult(scalar=None)])
        self.authenticate(consumer, session, storage)
        response = self.post(
            own_intent.id,
            data={
                "motivo": "Realizei a compra e tenho comprovante.",
                "consumidor_id": str(uuid.uuid4()),
                "status": "aprovada",
            },
            files={"arquivos": ("prova.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 201)
        contestation = session.added[0]
        self.assertEqual(contestation.consumidor_id, consumer.id)
        self.assertEqual(contestation.intencao_id, own_intent.id)
        self.assertEqual(contestation.status, StatusContestacaoCompra.aguardando_analise)
        self.assertTrue(session.committed)
        self.assertEqual(len(storage.uploaded), 1)
        self.assertEqual(response.json()["evidencias"][0]["nome_arquivo"], "prova.jpg")

    def test_contestacao_duplicada_retorna_409(self):
        consumer = profile()
        own_intent = intent(consumer.id)
        session = FakeSession([
            FakeResult(scalar=own_intent),
            FakeResult(scalar=uuid.uuid4()),
        ])
        self.authenticate(consumer, session, FakeStorage())
        self.assertEqual(self.post(own_intent.id).status_code, 409)

    def test_motivo_ausente_ou_vazio_retorna_422(self):
        self.authenticate(profile(), FakeSession(), FakeStorage())
        missing = self.client.post(
            f"/consumidor/intencoes-compra/{uuid.uuid4()}/contestacao"
        )
        empty = self.post(uuid.uuid4(), data={"motivo": "   "})
        self.assertEqual(missing.status_code, 422)
        self.assertEqual(empty.status_code, 422)

    def test_mime_invalido_retorna_415(self):
        consumer = profile()
        own_intent = intent(consumer.id)
        session = FakeSession([FakeResult(scalar=own_intent), FakeResult(scalar=None)])
        self.authenticate(consumer, session, FakeStorage())
        response = self.post(
            own_intent.id,
            files={"arquivos": ("prova.txt", b"texto", "text/plain")},
        )
        self.assertEqual(response.status_code, 415)

    def test_arquivo_grande_retorna_413(self):
        consumer = profile()
        own_intent = intent(consumer.id)
        session = FakeSession([FakeResult(scalar=own_intent), FakeResult(scalar=None)])
        self.authenticate(consumer, session, FakeStorage())
        response = self.post(
            own_intent.id,
            files={"arquivos": ("prova.jpg", b"\xff\xd8\xff" + b"x" * (5 * 1024 * 1024), "image/jpeg")},
        )
        self.assertEqual(response.status_code, 413)


if __name__ == "__main__":
    unittest.main()
