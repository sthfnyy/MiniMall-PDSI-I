import unittest
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import UserRole


class FakeResult:
    def __init__(self, scalar=None, rows=None):
        self.scalar = scalar
        self.rows = rows or []

    def scalar_one_or_none(self):
        return self.scalar

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, results=None, fail_commit=None):
        self.results = list(results or [])
        self.fail_commit = fail_commit
        self.statements = []
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, statement):
        self.statements.append(statement)
        if not self.results:
            raise AssertionError("Resultado falso não configurado")
        return self.results.pop(0)

    def add(self, instance):
        self.added.append(instance)

    async def delete(self, instance):
        self.deleted.append(instance)

    async def commit(self):
        if self.fail_commit is not None:
            raise self.fail_commit
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


def criar_profile(role=UserRole.consumidor, profile_id=None):
    instante = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=profile_id or uuid.uuid4(),
        role=role,
        nome_completo="Caio Silva",
        telefone=None,
        avatar_url=None,
        criado_em=instante,
        atualizado_em=instante,
    )


def criar_produto(produto_id=None, titulo="Produto favorito"):
    instante = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=produto_id or uuid.uuid4(),
        loja_id=uuid.uuid4(),
        categoria_id=uuid.uuid4(),
        titulo=titulo,
        descricao="Descrição",
        preco_base=Decimal("99.90"),
        foto_principal_url="https://example.com/produto.png",
        ativo=True,
        criado_em=instante,
        atualizado_em=instante,
    )


def criar_favorito(usuario_id, produto_id):
    return SimpleNamespace(
        usuario_id=usuario_id,
        produto_id=produto_id,
        criado_em=datetime(2026, 10, 12, 13, 0, tzinfo=UTC),
    )


class ConsumerFavoritosTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, profile=None, session=None):
        profile = profile or criar_profile()
        session = session or FakeSession()

        async def override_profile():
            return profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db
        return profile, session

    def test_get_retorna_favoritos_com_dados_do_produto(self):
        profile = criar_profile()
        produto = criar_produto()
        favorito = criar_favorito(profile.id, produto.id)
        session = FakeSession([FakeResult(rows=[(favorito, produto)])])
        self.autenticar(profile, session)

        response = self.client.get("/consumidor/favoritos")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["produto"]["id"], str(produto.id))
        self.assertEqual(response.json()[0]["produto"]["titulo"], produto.titulo)
        self.assertNotIn("usuario_id", response.json()[0])
        self.assertIn("ORDER BY favoritos.criado_em DESC", str(session.statements[0]))

    def test_get_vazio_retorna_lista_vazia(self):
        self.autenticar(session=FakeSession([FakeResult(rows=[])]))

        response = self.client.get("/consumidor/favoritos")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_get_filtra_pelo_consumidor_autenticado(self):
        profile, session = self.autenticar(
            session=FakeSession([FakeResult(rows=[])])
        )

        response = self.client.get("/consumidor/favoritos")

        self.assertEqual(response.status_code, 200)
        params = session.statements[0].compile().params
        self.assertIn(profile.id, params.values())

    def test_post_adiciona_favorito_com_profile_id(self):
        profile = criar_profile()
        produto = criar_produto()
        session = FakeSession(
            [FakeResult(scalar=produto), FakeResult(scalar=None)]
        )
        self.autenticar(profile, session)

        response = self.client.post(
            "/consumidor/favoritos", json={"produto_id": str(produto.id)}
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(session.added), 1)
        self.assertEqual(session.added[0].usuario_id, profile.id)
        self.assertEqual(session.added[0].produto_id, produto.id)
        self.assertTrue(session.committed)
        self.assertNotIn("usuario_id", response.json())

    def test_post_duplicado_retorna_409(self):
        profile = criar_profile()
        produto = criar_produto()
        favorito = criar_favorito(profile.id, produto.id)
        session = FakeSession(
            [FakeResult(scalar=produto), FakeResult(scalar=favorito)]
        )
        self.autenticar(profile, session)

        response = self.client.post(
            "/consumidor/favoritos", json={"produto_id": str(produto.id)}
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(session.added, [])

    def test_post_integrity_error_retorna_409_e_rollback(self):
        produto = criar_produto()
        error = IntegrityError("insert", {}, Exception("duplicado"))
        session = FakeSession(
            [FakeResult(scalar=produto), FakeResult(scalar=None)],
            fail_commit=error,
        )
        self.autenticar(session=session)

        response = self.client.post(
            "/consumidor/favoritos", json={"produto_id": str(produto.id)}
        )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(session.rolled_back)

    def test_post_produto_inexistente_retorna_404(self):
        produto_id = uuid.uuid4()
        self.autenticar(session=FakeSession([FakeResult(scalar=None)]))

        response = self.client.post(
            "/consumidor/favoritos", json={"produto_id": str(produto_id)}
        )

        self.assertEqual(response.status_code, 404)

    def test_post_uuid_invalido_retorna_422(self):
        self.autenticar()

        response = self.client.post(
            "/consumidor/favoritos", json={"produto_id": "invalido"}
        )

        self.assertEqual(response.status_code, 422)

    def test_post_rejeita_usuario_id_no_body(self):
        self.autenticar()

        response = self.client.post(
            "/consumidor/favoritos",
            json={"produto_id": str(uuid.uuid4()), "usuario_id": str(uuid.uuid4())},
        )

        self.assertEqual(response.status_code, 422)

    def test_delete_remove_favorito_do_consumidor(self):
        profile = criar_profile()
        produto_id = uuid.uuid4()
        favorito = criar_favorito(profile.id, produto_id)
        session = FakeSession([FakeResult(scalar=favorito)])
        self.autenticar(profile, session)

        response = self.client.delete(f"/consumidor/favoritos/{produto_id}")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(session.deleted, [favorito])
        self.assertTrue(session.committed)
        params = session.statements[0].compile().params
        self.assertIn(profile.id, params.values())
        self.assertIn(produto_id, params.values())

    def test_delete_favorito_inexistente_retorna_404(self):
        self.autenticar(session=FakeSession([FakeResult(scalar=None)]))

        response = self.client.delete(f"/consumidor/favoritos/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)

    def test_delete_nao_remove_favorito_de_outro_consumidor(self):
        profile = criar_profile()
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(profile, session)

        response = self.client.delete(f"/consumidor/favoritos/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(session.deleted, [])
        self.assertFalse(session.committed)
        self.assertIn(profile.id, session.statements[0].compile().params.values())

    def test_delete_uuid_invalido_retorna_422(self):
        self.autenticar()

        response = self.client.delete("/consumidor/favoritos/invalido")

        self.assertEqual(response.status_code, 422)

    def test_sem_jwt_retorna_401(self):
        response = self.client.get("/consumidor/favoritos")

        self.assertEqual(response.status_code, 401)

    def assert_role_proibida(self, role):
        profile = criar_profile(role=role)

        async def override_profile():
            return profile

        app.dependency_overrides[get_current_profile] = override_profile
        response = self.client.get("/consumidor/favoritos")
        self.assertEqual(response.status_code, 403)

    def test_lojista_retorna_403(self):
        self.assert_role_proibida(UserRole.lojista)

    def test_administrador_retorna_403(self):
        self.assert_role_proibida(UserRole.admin)

    def test_profile_inexistente_mantem_404(self):
        async def profile_inexistente():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado para este usuário",
            )

        app.dependency_overrides[get_current_profile] = profile_inexistente

        response = self.client.get("/consumidor/favoritos")

        self.assertEqual(response.status_code, 404)

    def test_post_falha_de_persistencia_executa_rollback(self):
        produto = criar_produto()
        session = FakeSession(
            [FakeResult(scalar=produto), FakeResult(scalar=None)],
            fail_commit=SQLAlchemyError("falha"),
        )
        self.autenticar(session=session)

        response = self.client.post(
            "/consumidor/favoritos", json={"produto_id": str(produto.id)}
        )

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)

    def test_delete_falha_de_persistencia_executa_rollback(self):
        profile = criar_profile()
        produto_id = uuid.uuid4()
        favorito = criar_favorito(profile.id, produto_id)
        session = FakeSession(
            [FakeResult(scalar=favorito)],
            fail_commit=SQLAlchemyError("falha"),
        )
        self.autenticar(profile, session)

        response = self.client.delete(f"/consumidor/favoritos/{produto_id}")

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)


if __name__ == "__main__":
    unittest.main()
