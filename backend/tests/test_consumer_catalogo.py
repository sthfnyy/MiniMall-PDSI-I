import unittest
import uuid
from decimal import Decimal
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import StatusLoja, UserRole


class FakeScalars:
    def __init__(self, items):
        self.items = items

    def all(self):
        return self.items


class FakeResult:
    def __init__(self, items):
        self.items = items

    def scalars(self):
        return FakeScalars(self.items)


class FakeSession:
    def __init__(self, results):
        self.results = [FakeResult(items) for items in results]
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return self.results.pop(0)


def criar_profile(role=UserRole.consumidor):
    return SimpleNamespace(id=uuid.uuid4(), role=role)


def criar_loja(status=StatusLoja.aprovada):
    return SimpleNamespace(
        id=uuid.uuid4(),
        nome_loja="Loja Centro",
        descricao="Moda e acessórios",
        endereco_logradouro="Rua Principal",
        endereco_numero="10",
        endereco_bairro="Centro",
        endereco_cidade="Iguatu",
        endereco_uf="CE",
        endereco_cep="63500-000",
        latitude=Decimal("-6.359000"),
        longitude=Decimal("-39.299000"),
        horario_funcionamento={"segunda": "08:00-18:00"},
        whatsapp="5588999999999",
        instagram="@lojacentro",
        facebook=None,
        logo_url="https://example.com/logo.png",
        status=status,
    )


def criar_produto(loja_id, categoria_id, ativo=True):
    return SimpleNamespace(
        id=uuid.uuid4(),
        loja_id=loja_id,
        categoria_id=categoria_id,
        titulo="Camisa",
        descricao="Camisa de algodão",
        preco_base=Decimal("59.90"),
        foto_principal_url="https://example.com/camisa.png",
        ativo=ativo,
    )


class ConsumerCatalogoTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, results, role=UserRole.consumidor):
        session = FakeSession(results)

        async def override_profile():
            return criar_profile(role)

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db
        return session

    def test_consumidor_consulta_catalogo_com_uuids_reais(self):
        loja = criar_loja()
        categoria = SimpleNamespace(id=uuid.uuid4(), nome="Vestuário")
        produto = criar_produto(loja.id, categoria.id)
        self.autenticar([[loja], [produto], [categoria]])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["lojas"][0]["id"], str(loja.id))
        self.assertEqual(body["produtos"][0]["id"], str(produto.id))
        self.assertEqual(body["produtos"][0]["loja_id"], str(loja.id))
        self.assertEqual(body["categorias"][0]["id"], str(categoria.id))
        self.assertNotIn("lojista_id", body["lojas"][0])
        self.assertNotIn("motivo_rejeicao", body["lojas"][0])

    def test_consultas_filtram_lojas_aprovadas_e_produtos_ativos(self):
        session = self.autenticar([[], [], []])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        lojas_sql, produtos_sql, categorias_sql = map(str, session.statements)
        self.assertIn("lojas.status", lojas_sql)
        self.assertIn("lojas.status", produtos_sql)
        self.assertIn("produtos.ativo IS true", produtos_sql)
        self.assertIn("lojas.status", categorias_sql)
        self.assertIn("produtos.ativo IS true", categorias_sql)

    def test_loja_pendente_nao_aparece(self):
        session = self.autenticar([[], [], []])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        self.assertIn(StatusLoja.aprovada, session.statements[0].compile().params.values())

    def test_loja_rejeitada_nao_aparece(self):
        session = self.autenticar([[], [], []])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(StatusLoja.rejeitada, session.statements[0].compile().params.values())

    def test_produto_inativo_nao_aparece(self):
        session = self.autenticar([[], [], []])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        self.assertIn("produtos.ativo IS true", str(session.statements[1]))

    def test_produto_de_loja_nao_aprovada_nao_aparece(self):
        session = self.autenticar([[], [], []])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        self.assertIn(StatusLoja.aprovada, session.statements[1].compile().params.values())

    def test_resposta_vazia(self):
        self.autenticar([[], [], []])

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"lojas": [], "produtos": [], "categorias": []})

    def test_sem_autenticacao_retorna_401(self):
        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 401)

    def test_lojista_nao_pode_consultar(self):
        self.autenticar([[], [], []], UserRole.lojista)

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 403)

    def test_admin_nao_pode_consultar(self):
        self.autenticar([[], [], []], UserRole.admin)

        response = self.client.get("/consumidor/catalogo")

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
