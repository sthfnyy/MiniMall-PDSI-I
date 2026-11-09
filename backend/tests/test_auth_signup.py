import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from backend.config.database import get_db
from backend.main import app


class FakeDbSession:
    def __init__(self):
        self.statements = []
        self.committed = False

    async def execute(self, statement, params=None):
        self.statements.append((statement, params))

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass


class AuthSignupTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDbSession()

        async def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_signup_role_invalido(self):
        response = self.client.post(
            "/auth/signup",
            json={
                "name": "Admin Tester",
                "email": "admin2@minimall.com",
                "password": "Password123!",
                "role": "administrador",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("perfil válido", response.json()["detail"])

    def test_signup_senha_curta(self):
        response = self.client.post(
            "/auth/signup",
            json={
                "name": "Maria Lojista",
                "email": "maria@minimall.com",
                "password": "123",
                "role": "lojista",
            },
        )
        self.assertEqual(response.status_code, 422)

    @patch("backend.controllers.auth_profile.httpx.AsyncClient")
    def test_signup_sucesso_lojista(self, mock_client_cls):
        user_uuid = str(uuid.uuid4())
        mock_client = AsyncMock()

        # Resposta do admin create user (httpx.Response.json() é síncrono)
        res_admin = MagicMock()
        res_admin.status_code = 200
        res_admin.text = '{"id": "%s"}' % user_uuid
        res_admin.json.return_value = {"id": user_uuid, "email": "lojista_novo@minimall.com"}

        # Resposta do login token
        res_token = MagicMock()
        res_token.status_code = 200
        res_token.text = '{"access_token": "token_abc123"}'
        res_token.json.return_value = {
            "access_token": "token_abc123",
            "token_type": "bearer",
            "refresh_token": "refresh_123",
        }

        mock_client.post.side_effect = [res_admin, res_token]
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        response = self.client.post(
            "/auth/signup",
            json={
                "name": "Lojista Novo",
                "email": "lojista_novo@minimall.com",
                "password": "Password123!",
                "role": "lojista",
            },
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["user"]["email"], "lojista_novo@minimall.com")
        self.assertEqual(data["user"]["role"], "lojista")
        self.assertEqual(data["accessToken"], "token_abc123")
        self.assertTrue(self.db.committed)

    @patch("backend.controllers.auth_profile.httpx.AsyncClient")
    def test_signup_email_ja_cadastrado(self, mock_client_cls):
        mock_client = AsyncMock()

        res_admin = MagicMock()
        res_admin.status_code = 422
        res_admin.text = '{"msg": "A user with this email address has already been registered"}'
        res_admin.json.return_value = {
            "msg": "A user with this email address has already been registered"
        }

        mock_client.post.return_value = res_admin
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        response = self.client.post(
            "/auth/signup",
            json={
                "name": "Maria Existente",
                "email": "existente@minimall.com",
                "password": "Password123!",
                "role": "consumidor",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Este e-mail já está cadastrado.")


if __name__ == "__main__":
    unittest.main()
