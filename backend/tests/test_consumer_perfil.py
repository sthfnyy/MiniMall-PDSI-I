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


class FakeSession:
    def __init__(self, fail_commit: bool = False):
        self.fail_commit = fail_commit
        self.committed = False
        self.refreshed = False
        self.rolled_back = False

    async def commit(self):
        if self.fail_commit:
            raise SQLAlchemyError("falha de persistência")
        self.committed = True

    async def refresh(self, _profile):
        self.refreshed = True

    async def rollback(self):
        self.rolled_back = True


def criar_profile(role: UserRole = UserRole.consumidor):
    instante = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        role=role,
        nome_completo="Caio Silva",
        telefone="89999999999",
        avatar_url="https://example.com/avatar.png",
        criado_em=instante,
        atualizado_em=instante,
    )


class ConsumerPerfilTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, profile=None, session=None):
        profile = profile or criar_profile()
        session = session or FakeSession()

        async def override_consumer():
            return profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_consumer
        app.dependency_overrides[get_db] = override_db
        return profile, session

    def test_consumidor_consulta_proprio_perfil(self):
        profile, _ = self.autenticar()

        response = self.client.get("/consumidor/perfil")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(profile.id))
        self.assertEqual(response.json()["role"], "consumidor")

    def test_consumidor_atualiza_nome(self):
        profile, session = self.autenticar()

        response = self.client.patch(
            "/consumidor/perfil", json={"nome_completo": "Novo Nome"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(profile.nome_completo, "Novo Nome")
        self.assertTrue(session.committed)
        self.assertTrue(session.refreshed)

    def test_consumidor_atualiza_telefone(self):
        profile, _ = self.autenticar()

        response = self.client.patch(
            "/consumidor/perfil", json={"telefone": "88988887777"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(profile.telefone, "88988887777")

    def test_consumidor_atualiza_avatar(self):
        profile, _ = self.autenticar()

        response = self.client.patch(
            "/consumidor/perfil",
            json={"avatar_url": "https://example.com/novo-avatar.png"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(profile.avatar_url, "https://example.com/novo-avatar.png")

    def test_patch_parcial_preserva_campos_omitidos(self):
        profile, _ = self.autenticar()
        telefone_anterior = profile.telefone
        avatar_anterior = profile.avatar_url

        response = self.client.patch(
            "/consumidor/perfil", json={"nome_completo": "Outro Nome"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(profile.telefone, telefone_anterior)
        self.assertEqual(profile.avatar_url, avatar_anterior)

    def test_telefone_null_remove_telefone(self):
        profile, _ = self.autenticar()

        response = self.client.patch(
            "/consumidor/perfil", json={"telefone": None}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(profile.telefone)

    def test_avatar_null_remove_avatar(self):
        profile, _ = self.autenticar()

        response = self.client.patch(
            "/consumidor/perfil", json={"avatar_url": None}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(profile.avatar_url)

    def configurar_perfil_proibido(self, role):
        profile = criar_profile(role)

        async def perfil_autenticado():
            return profile

        app.dependency_overrides[get_current_profile] = perfil_autenticado

    def test_lojista_recebe_403(self):
        self.configurar_perfil_proibido(UserRole.lojista)
        response = self.client.get("/consumidor/perfil")
        self.assertEqual(response.status_code, 403)

    def test_administrador_recebe_403(self):
        self.configurar_perfil_proibido(UserRole.admin)
        response = self.client.get("/consumidor/perfil")
        self.assertEqual(response.status_code, 403)

    def test_usuario_nao_autenticado_recebe_401(self):
        response = self.client.get("/consumidor/perfil")
        self.assertEqual(response.status_code, 401)

    def test_perfil_inexistente_recebe_404(self):
        async def perfil_inexistente():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado para este usuário",
            )

        app.dependency_overrides[get_current_profile] = perfil_inexistente
        response = self.client.get("/consumidor/perfil")
        self.assertEqual(response.status_code, 404)

    def assert_campo_proibido(self, campo, valor):
        self.autenticar()
        response = self.client.patch("/consumidor/perfil", json={campo: valor})
        self.assertEqual(response.status_code, 422)

    def test_rejeita_alteracao_de_role(self):
        self.assert_campo_proibido("role", "admin")

    def test_rejeita_alteracao_de_id(self):
        self.assert_campo_proibido("id", str(uuid.uuid4()))

    def test_rejeita_alteracao_de_criado_em(self):
        self.assert_campo_proibido("criado_em", "2026-10-09T12:00:00Z")

    def test_rejeita_alteracao_de_atualizado_em(self):
        self.assert_campo_proibido("atualizado_em", "2026-10-09T12:00:00Z")

    def test_rejeita_usuario_id(self):
        self.assert_campo_proibido("usuario_id", str(uuid.uuid4()))

    def test_falha_de_persistencia_executa_rollback(self):
        session = FakeSession(fail_commit=True)
        self.autenticar(session=session)

        response = self.client.patch(
            "/consumidor/perfil", json={"nome_completo": "Novo Nome"}
        )

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)
        self.assertEqual(
            response.json()["detail"], "Não foi possível atualizar o perfil"
        )


if __name__ == "__main__":
    unittest.main()
