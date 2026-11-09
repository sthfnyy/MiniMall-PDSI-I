import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.auth import get_current_profile, get_lojista_loja, require_lojista
from backend.config.database import get_db
from backend.main import app
from backend.models import UserRole


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows

    def scalars(self):
        return self

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None


class FakeDbSession:
    def __init__(self, query_results=None):
        self.query_results = list(query_results or [])

    async def execute(self, statement, params=None):
        if self.query_results:
            return FakeResult(self.query_results.pop(0))
        return FakeResult([])


class LojistaAvaliacoesTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_requisicao_sem_autenticacao(self):
        response = self.client.get("/lojista/avaliacoes")
        self.assertEqual(response.status_code, 401)

    def test_consumidor_nao_pode_acessar(self):
        consumidor_profile = SimpleNamespace(
            id=uuid.uuid4(),
            role=UserRole.consumidor,
            nome_completo="Consumidor Teste",
        )
        app.dependency_overrides[get_current_profile] = lambda: consumidor_profile

        response = self.client.get("/lojista/avaliacoes")
        self.assertEqual(response.status_code, 403)
        self.assertIn("restrito a lojistas", response.json()["detail"])

    def test_lojista_sem_loja_retorna_404(self):
        lojista_profile = SimpleNamespace(
            id=uuid.uuid4(),
            role=UserRole.lojista,
            nome_completo="Lojista Sem Loja",
        )
        app.dependency_overrides[get_current_profile] = lambda: lojista_profile
        app.dependency_overrides[require_lojista] = lambda: lojista_profile

        fake_db = FakeDbSession([[]])  # Sem loja encontrada
        app.dependency_overrides[get_db] = lambda: fake_db

        response = self.client.get("/lojista/avaliacoes")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Loja não encontrada", response.json()["detail"])

    def test_loja_sem_avaliacoes_retorna_lista_vazia(self):
        loja_id = uuid.uuid4()
        loja = SimpleNamespace(id=loja_id, lojista_id=uuid.uuid4(), nome_loja="Minha Loja")
        app.dependency_overrides[get_lojista_loja] = lambda: loja

        fake_db = FakeDbSession([[]])  # Nenhuma avaliação
        app.dependency_overrides[get_db] = lambda: fake_db

        response = self.client.get("/lojista/avaliacoes")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_lista_avaliacoes_da_propria_loja_com_fotos(self):
        loja_id = uuid.uuid4()
        loja = SimpleNamespace(id=loja_id, lojista_id=uuid.uuid4(), nome_loja="Minha Loja")
        app.dependency_overrides[get_lojista_loja] = lambda: loja

        agora = datetime.now(UTC)
        aval_id1 = uuid.uuid4()
        aval_id2 = uuid.uuid4()

        avaliacao1 = SimpleNamespace(
            id=aval_id1,
            loja_id=loja_id,
            usuario_id=uuid.uuid4(),
            nota=5,
            comentario="Excelente atendimento!",
            foto_url="https://example.com/foto1.jpg",
            criado_em=agora,
        )
        avaliacao2 = SimpleNamespace(
            id=aval_id2,
            loja_id=loja_id,
            usuario_id=uuid.uuid4(),
            nota=4,
            comentario="Entrega rápida.",
            foto_url="https://example.com/foto2.jpg",
            criado_em=agora,
        )

        foto_extra = SimpleNamespace(
            id=uuid.uuid4(),
            avaliacao_id=aval_id1,
            url="https://example.com/foto_extra1.jpg",
            criado_em=agora,
        )

        # 1ª query: avaliações com nome do perfil
        rows_avaliacoes = [
            (avaliacao1, "Maria Consumidora"),
            (avaliacao2, "João Cliente"),
        ]
        # 2ª query: fotos das avaliações
        rows_fotos = [foto_extra]

        fake_db = FakeDbSession([rows_avaliacoes, rows_fotos])
        app.dependency_overrides[get_db] = lambda: fake_db

        response = self.client.get("/lojista/avaliacoes")
        self.assertEqual(response.status_code, 200)
        dados = response.json()
        self.assertEqual(len(dados), 2)

        # Validação do primeiro item
        self.assertEqual(dados[0]["id"], str(aval_id1))
        self.assertEqual(dados[0]["nota"], 5)
        self.assertEqual(dados[0]["comentario"], "Excelente atendimento!")
        self.assertEqual(dados[0]["consumidor_nome"], "Maria Consumidora")
        self.assertEqual(len(dados[0]["fotos"]), 1)
        self.assertEqual(dados[0]["fotos"][0]["url"], "https://example.com/foto_extra1.jpg")

        # Validação do segundo item
        self.assertEqual(dados[1]["id"], str(aval_id2))
        self.assertEqual(dados[1]["nota"], 4)
        self.assertEqual(dados[1]["comentario"], "Entrega rápida.")
        self.assertEqual(dados[1]["consumidor_nome"], "João Cliente")
        self.assertEqual(len(dados[1]["fotos"]), 0)


if __name__ == "__main__":
    unittest.main()
