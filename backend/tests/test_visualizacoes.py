
import unittest
import uuid
import base64
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwt
from sqlalchemy.exc import SQLAlchemyError
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from backend.config.database import get_db
from backend.controllers.visualizacoes import get_optional_user_id
from backend.main import app


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.records = []
        self.committed = False

    async def execute(self, statement):
        value = self.results.pop(0)
        return FakeResult(value)

    def add(self, record):
        self.records.append(record)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass


class VisualizacoesTestCase(unittest.TestCase):

    def setUp(self):
        self.db = FakeSession()

        async def override_db():
            yield self.db

        async def override_user():
            return None

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_optional_user_id] = override_user

        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()

    def test_requisicao_sem_identificadores(self):
        response = self.client.post("/visualizacoes")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.db.committed)

    def test_visitante_nao_pode_informar_outro_usuario(self):
        response = self.client.post(
            "/visualizacoes",
            params={
                "loja_id": str(uuid.uuid4()),
                "usuario_id": str(uuid.uuid4()),
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.db.committed)

    def test_loja_inexistente(self):
        self.db = FakeSession([None])

        response = self.client.post(
            "/visualizacoes",
            params={"loja_id": str(uuid.uuid4())},
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.db.committed)

    def test_visualizacao_anonima_em_loja_aprovada(self):
        self.db = FakeSession([
            SimpleNamespace(id=uuid.uuid4())
        ])

        loja_id = uuid.uuid4()

        response = self.client.post(
            "/visualizacoes",
            params={"loja_id": str(loja_id)},
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(self.db.committed)
        self.assertEqual(len(self.db.records), 1)

        registro = self.db.records[0]

        self.assertEqual(registro.loja_id, loja_id)
        self.assertIsNone(registro.usuario_id)

    def test_produto_inexistente(self):
        self.db = FakeSession([None])

        response = self.client.post(
            "/visualizacoes",
            params={"produto_id": str(uuid.uuid4())},
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.db.committed)

    def test_produto_inativo(self):
        produto = SimpleNamespace(
            id=uuid.uuid4(),
            loja_id=uuid.uuid4(),
            ativo=False,
        )

        self.db = FakeSession([produto])

        response = self.client.post(
            "/visualizacoes",
            params={"produto_id": str(produto.id)},
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.db.committed)

    def test_produto_de_outra_loja(self):
        produto = SimpleNamespace(
            id=uuid.uuid4(),
            loja_id=uuid.uuid4(),
            ativo=True,
        )

        self.db = FakeSession([produto])

        response = self.client.post(
            "/visualizacoes",
            params={
                "produto_id": str(produto.id),
                "loja_id": str(uuid.uuid4()),
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertFalse(self.db.committed)
    
    def test_visualizacao_usuario_autenticado(self):
        usuario_id = uuid.uuid4()
        loja_id = uuid.uuid4()

        async def override_user():
            return usuario_id

        app.dependency_overrides[get_optional_user_id] = override_user

        self.db = FakeSession([
            SimpleNamespace(id=loja_id)
        ])

        response = self.client.post(
            "/visualizacoes",
            params={"loja_id": str(loja_id)},
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(self.db.committed)
        self.assertEqual(len(self.db.records), 1)
        self.assertEqual(
            self.db.records[0].usuario_id,
            usuario_id,
        )

    def test_falha_persistencia_executa_rollback(self):
        loja_id = uuid.uuid4()

        class FailingSession(FakeSession):
            def __init__(self):
                super().__init__([
                    SimpleNamespace(id=loja_id)
                ])
                self.rolled_back = False

            async def commit(self):
                raise SQLAlchemyError("Falha simulada no banco")

            async def rollback(self):
                self.rolled_back = True

        self.db = FailingSession()

        response = self.client.post(
            "/visualizacoes",
            params={"loja_id": str(loja_id)},
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json()["detail"],
            "Não foi possível registrar a visualização",
        )
        self.assertTrue(self.db.rolled_back)
        self.assertEqual(len(self.db.records), 1)
        self.assertFalse(self.db.committed)

    def test_token_jwt_invalido_retorna_401(self):
        app.dependency_overrides.pop(get_optional_user_id, None)
        resposta_jwks = MagicMock()
        resposta_jwks.json.return_value = {"keys": []}

        with patch("backend.auth.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = (
                AsyncMock(return_value=resposta_jwks)
            )

            response = self.client.post(
                "/visualizacoes",
                params={"loja_id": str(uuid.uuid4())},
                headers={
                    "Authorization": "Bearer token-invalido"
                },
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json()["detail"],
            "Token inválido ou expirado",
        )
        self.assertFalse(self.db.committed)
        self.assertEqual(len(self.db.records), 0)

    def test_token_jwt_expirado_retorna_401(self):
        app.dependency_overrides.pop(get_optional_user_id, None)

        # Gera um par de chaves temporário somente para o teste.
        chave_privada = ec.generate_private_key(ec.SECP256R1())
        chave_publica = chave_privada.public_key().public_numbers()

        def codificar_coordenada(valor):
            dados = valor.to_bytes(32, "big")
            return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()

        jwk_publica = {
            "kty": "EC",
            "crv": "P-256",
            "kid": "chave-teste",
            "alg": "ES256",
            "use": "sig",
            "x": codificar_coordenada(chave_publica.x),
            "y": codificar_coordenada(chave_publica.y),
        }

        chave_pem = chave_privada.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()

        agora = datetime.now(timezone.utc)

        token_expirado = jwt.encode(
            {
                "sub": str(uuid.uuid4()),
                "aud": "authenticated",
                "iat": int((agora - timedelta(minutes=10)).timestamp()),
                "exp": int((agora - timedelta(minutes=5)).timestamp()),
            },
            chave_pem,
            algorithm="ES256",
            headers={"kid": "chave-teste"},
        )

        resposta_jwks = MagicMock()
        resposta_jwks.json.return_value = {
            "keys": [jwk_publica]
        }

        with patch("backend.auth.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = (
                AsyncMock(return_value=resposta_jwks)
            )

            response = self.client.post(
                "/visualizacoes",
                params={"loja_id": str(uuid.uuid4())},
                headers={
                    "Authorization": f"Bearer {token_expirado}"
                },
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json()["detail"],
            "Token inválido ou expirado",
        )
        self.assertFalse(self.db.committed)
        self.assertEqual(len(self.db.records), 0)

    def test_visualizacao_produto_ativo_loja_aprovada(self):
        loja_id = uuid.uuid4()
        produto_id = uuid.uuid4()

        produto = SimpleNamespace(
            id=produto_id,
            loja_id=loja_id,
            ativo=True,
        )

        loja = SimpleNamespace(id=loja_id)

        self.db = FakeSession([produto, loja])

        response = self.client.post(
            "/visualizacoes",
            params={"produto_id": str(produto_id)},
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(self.db.committed)
        self.assertEqual(len(self.db.records), 1)

        registro = self.db.records[0]

        self.assertEqual(registro.produto_id, produto_id)
        self.assertIsNone(registro.usuario_id)


if __name__ == "__main__":
    unittest.main()
