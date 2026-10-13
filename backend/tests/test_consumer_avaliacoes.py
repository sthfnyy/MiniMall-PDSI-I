import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import UserRole


class FakeScalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class FakeResult:
    def __init__(self, scalar=None, scalars=None):
        self.scalar = scalar
        self.scalar_values = list(scalars or [])

    def scalar_one_or_none(self):
        return self.scalar

    def scalars(self):
        return FakeScalars(self.scalar_values)


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
    return SimpleNamespace(
        id=profile_id or uuid.uuid4(),
        role=role,
        nome_completo="Consumidor",
    )


def criar_avaliacao(usuario_id=None, avaliacao_id=None, nota=4, comentario="Boa loja"):
    return SimpleNamespace(
        id=avaliacao_id or uuid.uuid4(),
        loja_id=uuid.uuid4(),
        usuario_id=usuario_id or uuid.uuid4(),
        nota=nota,
        comentario=comentario,
        foto_url="",
        criado_em=datetime(2026, 10, 12, 12, 0, tzinfo=UTC),
    )


class ConsumerAvaliacoesTestCase(unittest.TestCase):
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

    def test_get_retorna_somente_avaliacoes_do_consumidor(self):
        profile = criar_profile()
        avaliacao = criar_avaliacao(profile.id)
        session = FakeSession([FakeResult(scalars=[avaliacao])])
        self.autenticar(profile, session)

        response = self.client.get("/consumidor/avaliacoes")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["id"], str(avaliacao.id))
        self.assertNotIn("usuario_id", response.json()[0])
        statement = session.statements[0]
        self.assertIn(profile.id, statement.compile().params.values())
        self.assertIn("ORDER BY avaliacoes.criado_em DESC", str(statement))

    def test_get_vazio_retorna_lista_vazia(self):
        self.autenticar(session=FakeSession([FakeResult(scalars=[])]))

        response = self.client.get("/consumidor/avaliacoes")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def publicar(self, nota=4, **campos):
        profile = criar_profile()
        loja_id = uuid.uuid4()
        session = FakeSession([FakeResult(scalar=SimpleNamespace(id=loja_id))])
        self.autenticar(profile, session)
        payload = {"loja_id": str(loja_id), "nota": nota, "comentario": "Ótima"}
        payload.update(campos)
        response = self.client.post("/consumidor/avaliacoes", json=payload)
        return response, profile, session, loja_id

    def test_post_cria_avaliacao_e_retorna_201(self):
        response, _, session, loja_id = self.publicar()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["loja_id"], str(loja_id))
        self.assertEqual(response.json()["comentario"], "Ótima")
        self.assertNotIn("usuario_id", response.json())
        self.assertTrue(session.committed)

    def test_post_define_usuario_id_automaticamente(self):
        _, profile, session, _ = self.publicar()

        self.assertEqual(session.added[0].usuario_id, profile.id)

    def test_post_aceita_notas_limites(self):
        for nota in (1, 5):
            with self.subTest(nota=nota):
                response, _, session, _ = self.publicar(nota=nota)
                self.assertEqual(response.status_code, 201)
                self.assertEqual(session.added[0].nota, nota)

    def test_post_rejeita_notas_fora_do_intervalo(self):
        for nota in (0, 6):
            with self.subTest(nota=nota):
                response, _, session, _ = self.publicar(nota=nota)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(session.statements, [])

    def test_post_rejeita_nota_fracionaria(self):
        response, _, session, _ = self.publicar(nota=4.5)

        self.assertEqual(response.status_code, 422)
        self.assertEqual(session.statements, [])

    def test_post_loja_inexistente_retorna_404(self):
        loja_id = uuid.uuid4()
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(session=session)

        response = self.client.post(
            "/consumidor/avaliacoes",
            json={"loja_id": str(loja_id), "nota": 4},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(session.added, [])

    def test_post_rejeita_campo_extra(self):
        response, _, _, _ = self.publicar(produto_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 422)

    def test_post_rejeita_id_e_criado_em(self):
        for campo, valor in (
            ("id", str(uuid.uuid4())),
            ("criado_em", "2026-10-12T12:00:00Z"),
        ):
            with self.subTest(campo=campo):
                response, _, _, _ = self.publicar(**{campo: valor})
                self.assertEqual(response.status_code, 422)

    def test_post_rejeita_usuario_id_enviado(self):
        response, _, _, _ = self.publicar(usuario_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 422)

    def test_patch_atualiza_avaliacao_propria(self):
        profile = criar_profile()
        avaliacao = criar_avaliacao(profile.id)
        session = FakeSession([FakeResult(scalar=avaliacao)])
        self.autenticar(profile, session)

        response = self.client.patch(
            f"/consumidor/avaliacoes/{avaliacao.id}",
            json={"nota": 5, "comentario": "Atualizada"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(avaliacao.nota, 5)
        self.assertEqual(avaliacao.comentario, "Atualizada")
        self.assertTrue(session.committed)
        self.assertIn(profile.id, session.statements[0].compile().params.values())

    def test_patch_parcial_preserva_campos_omitidos(self):
        profile = criar_profile()
        avaliacao = criar_avaliacao(profile.id, nota=3, comentario="Original")
        session = FakeSession([FakeResult(scalar=avaliacao)])
        self.autenticar(profile, session)

        response = self.client.patch(
            f"/consumidor/avaliacoes/{avaliacao.id}",
            json={"comentario": None},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(avaliacao.nota, 3)
        self.assertIsNone(avaliacao.comentario)

    def test_patch_rejeita_nota_invalida(self):
        self.autenticar()

        for nota in (0, 6, 2.5, None):
            with self.subTest(nota=nota):
                response = self.client.patch(
                    f"/consumidor/avaliacoes/{uuid.uuid4()}",
                    json={"nota": nota},
                )
                self.assertEqual(response.status_code, 422)

    def test_patch_de_outro_consumidor_retorna_404(self):
        profile = criar_profile()
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(profile, session)

        response = self.client.patch(
            f"/consumidor/avaliacoes/{uuid.uuid4()}",
            json={"nota": 5},
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(session.committed)
        self.assertIn(profile.id, session.statements[0].compile().params.values())

    def test_delete_remove_avaliacao_propria(self):
        profile = criar_profile()
        avaliacao = criar_avaliacao(profile.id)
        session = FakeSession([FakeResult(scalar=avaliacao)])
        self.autenticar(profile, session)

        response = self.client.delete(f"/consumidor/avaliacoes/{avaliacao.id}")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(session.deleted, [avaliacao])
        self.assertTrue(session.committed)

    def test_delete_de_outro_consumidor_retorna_404(self):
        profile = criar_profile()
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(profile, session)

        response = self.client.delete(f"/consumidor/avaliacoes/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(session.deleted, [])
        self.assertFalse(session.committed)
        self.assertIn(profile.id, session.statements[0].compile().params.values())

    def test_uuid_invalido_retorna_422(self):
        self.autenticar()
        for method in (self.client.patch, self.client.delete):
            with self.subTest(method=method.__name__):
                kwargs = {"json": {"nota": 4}} if method == self.client.patch else {}
                response = method("/consumidor/avaliacoes/invalido", **kwargs)
                self.assertEqual(response.status_code, 422)

    def test_sem_autenticacao_retorna_401(self):
        response = self.client.get("/consumidor/avaliacoes")
        self.assertEqual(response.status_code, 401)

    def test_lojista_e_admin_retorna_403(self):
        for role in (UserRole.lojista, UserRole.admin):
            with self.subTest(role=role):
                app.dependency_overrides.clear()

                async def override_profile(role=role):
                    return criar_profile(role=role)

                app.dependency_overrides[get_current_profile] = override_profile
                response = self.client.get("/consumidor/avaliacoes")
                self.assertEqual(response.status_code, 403)

    def test_perfil_inexistente_retorna_404(self):
        async def profile_inexistente():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado para este usuário",
            )

        app.dependency_overrides[get_current_profile] = profile_inexistente
        response = self.client.get("/consumidor/avaliacoes")
        self.assertEqual(response.status_code, 404)

    def test_post_falha_de_persistencia_executa_rollback(self):
        loja_id = uuid.uuid4()
        session = FakeSession(
            [FakeResult(scalar=SimpleNamespace(id=loja_id))],
            fail_commit=SQLAlchemyError("falha"),
        )
        self.autenticar(session=session)

        response = self.client.post(
            "/consumidor/avaliacoes",
            json={"loja_id": str(loja_id), "nota": 4},
        )

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)

    def test_patch_falha_de_persistencia_executa_rollback(self):
        profile = criar_profile()
        avaliacao = criar_avaliacao(profile.id)
        session = FakeSession(
            [FakeResult(scalar=avaliacao)],
            fail_commit=SQLAlchemyError("falha"),
        )
        self.autenticar(profile, session)

        response = self.client.patch(
            f"/consumidor/avaliacoes/{avaliacao.id}", json={"nota": 5}
        )

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)

    def test_delete_falha_de_persistencia_executa_rollback(self):
        profile = criar_profile()
        avaliacao = criar_avaliacao(profile.id)
        session = FakeSession(
            [FakeResult(scalar=avaliacao)],
            fail_commit=SQLAlchemyError("falha"),
        )
        self.autenticar(profile, session)

        response = self.client.delete(f"/consumidor/avaliacoes/{avaliacao.id}")

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)


if __name__ == "__main__":
    unittest.main()
