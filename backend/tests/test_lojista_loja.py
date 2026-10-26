import unittest
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import Loja, Profile, StatusLoja, UserRole


class FakeResult:
    def __init__(self, scalar=None, scalars=None):
        self._scalar = scalar
        self._scalars = list(scalars or [])

    def scalar_one_or_none(self):
        return self._scalar

    def scalar_one(self):
        return self._scalar

    def scalars(self):
        return self._scalars


class FakeSession:
    def __init__(self, results=None, default_scalar=None, fail_commit: bool = False):
        self.results = list(results or [])
        self.default_scalar = default_scalar
        self.fail_commit = fail_commit
        self.records = []
        self.committed = False
        self.refreshed = False
        self.rolled_back = False
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if self.results:
            val = self.results.pop(0)
            return FakeResult(scalar=val)
        return FakeResult(scalar=self.default_scalar)

    def add(self, record):
        self.records.append(record)

    async def commit(self):
        if self.fail_commit:
            raise SQLAlchemyError("falha de persistência")
        self.committed = True

    async def refresh(self, obj):
        self.refreshed = True

    async def rollback(self):
        self.rolled_back = True


def criar_profile(role: UserRole = UserRole.lojista, user_id: uuid.UUID | None = None):
    instante = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=user_id or uuid.uuid4(),
        role=role,
        nome_completo="Lojista Silva",
        telefone="89999999999",
        avatar_url="https://example.com/avatar.png",
        criado_em=instante,
        atualizado_em=instante,
    )


def criar_loja(
    lojista_id: uuid.UUID,
    loja_id: uuid.UUID | None = None,
    status_loja: StatusLoja = StatusLoja.pendente,
    motivo_rejeicao: str | None = None,
):
    instante = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=loja_id or uuid.uuid4(),
        lojista_id=lojista_id,
        nome_loja="Loja Modelo",
        descricao="Moda e Acessórios",
        endereco_logradouro="Rua Central",
        endereco_numero="100",
        endereco_bairro="Centro",
        endereco_cidade="Picos",
        endereco_uf="PI",
        endereco_cep="64600000",
        latitude=Decimal("-7.0774"),
        longitude=Decimal("-41.4669"),
        horario_funcionamento={"seg-sex": "08:00 - 18:00"},
        whatsapp="89988887777",
        instagram="@lojamodelo",
        facebook=None,
        logo_url="https://example.com/logo.png",
        status=status_loja,
        motivo_rejeicao=motivo_rejeicao,
        aprovado_por=None,
        aprovado_em=None,
        criado_em=instante,
        atualizado_em=instante,
    )


class LojistaLojaTestCase(unittest.TestCase):
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

    # ==========================
    # CONSULTA (GET /lojista/loja)
    # ==========================

    def test_lojista_consulta_propria_loja(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(lojista_id=profile.id)
        session = FakeSession(results=[loja])
        self.autenticar(profile=profile, session=session)

        response = self.client.get("/lojista/loja")

        self.assertEqual(response.status_code, 200)
        dados = response.json()
        self.assertEqual(dados["id"], str(loja.id))
        self.assertEqual(dados["lojista_id"], str(profile.id))
        self.assertEqual(dados["nome_loja"], "Loja Modelo")
        self.assertEqual(dados["status"], "pendente")

    def test_lojista_sem_loja_recebe_404(self):
        profile = criar_profile(UserRole.lojista)
        session = FakeSession(results=[None])
        self.autenticar(profile=profile, session=session)

        response = self.client.get("/lojista/loja")

        self.assertEqual(response.status_code, 404)
        self.assertIn("Loja não encontrada", response.json()["detail"])

    def test_consumidor_recebe_403_ao_consultar_loja(self):
        profile = criar_profile(UserRole.consumidor)
        self.autenticar(profile=profile)

        response = self.client.get("/lojista/loja")

        self.assertEqual(response.status_code, 403)
        self.assertIn("Acesso restrito a lojistas", response.json()["detail"])

    def test_usuario_nao_autenticado_recebe_401(self):
        response = self.client.get("/lojista/loja")
        self.assertEqual(response.status_code, 401)

    # ==========================
    # CADASTRO (POST /lojista/loja)
    # ==========================

    def test_cadastrar_loja_sucesso(self):
        profile = criar_profile(UserRole.consumidor)
        session = FakeSession(results=[None])
        self.autenticar(profile=profile, session=session)

        payload = {
            "nome_loja": "Nova Loja",
            "descricao": "Artigos em geral",
            "endereco_logradouro": "Av. Brasil",
            "endereco_numero": "500",
            "endereco_bairro": "Bela Vista",
            "endereco_cidade": "Picos",
            "endereco_uf": "pi",
            "whatsapp": "89999990000",
        }

        response = self.client.post("/lojista/loja", json=payload)

        self.assertEqual(response.status_code, 201)
        dados = response.json()
        self.assertEqual(dados["nome_loja"], "Nova Loja")
        self.assertEqual(dados["endereco_uf"], "PI")
        self.assertEqual(dados["status"], "pendente")
        self.assertEqual(profile.role, UserRole.lojista)
        self.assertTrue(session.committed)
        self.assertEqual(len(session.records), 1)

    def test_cadastrar_loja_ja_existente_retorna_400(self):
        profile = criar_profile(UserRole.lojista)
        loja_existente = criar_loja(lojista_id=profile.id)
        session = FakeSession(results=[loja_existente])
        self.autenticar(profile=profile, session=session)

        payload = {
            "nome_loja": "Segunda Loja",
            "endereco_cidade": "Picos",
            "endereco_uf": "PI",
            "whatsapp": "89999990000",
        }

        response = self.client.post("/lojista/loja", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertIn("já possui uma loja", response.json()["detail"])

    def test_cadastrar_loja_com_uf_invalida_retorna_422(self):
        profile = criar_profile(UserRole.lojista)
        session = FakeSession(results=[None])
        self.autenticar(profile=profile, session=session)

        payload = {
            "nome_loja": "Loja Errada",
            "endereco_cidade": "Picos",
            "endereco_uf": "PIAUI",
            "whatsapp": "89999990000",
        }

        response = self.client.post("/lojista/loja", json=payload)

        self.assertEqual(response.status_code, 422)

    def test_tentativa_de_injetar_status_no_cadastro_retorna_422(self):
        profile = criar_profile(UserRole.lojista)
        session = FakeSession(results=[None])
        self.autenticar(profile=profile, session=session)

        payload = {
            "nome_loja": "Loja Hacker",
            "endereco_cidade": "Picos",
            "endereco_uf": "PI",
            "whatsapp": "89999990000",
            "status": "aprovada",
        }

        response = self.client.post("/lojista/loja", json=payload)

        self.assertEqual(response.status_code, 422)

    # ==========================
    # ATUALIZAÇÃO (PATCH /lojista/loja)
    # ==========================

    def test_lojista_atualiza_dados_cadastrais(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(lojista_id=profile.id)
        session = FakeSession(results=[loja])
        self.autenticar(profile=profile, session=session)

        payload = {
            "nome_loja": "Loja Renomeada",
            "whatsapp": "89911112222",
            "descricao": "Nova descrição atualizada",
        }

        response = self.client.patch("/lojista/loja", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(loja.nome_loja, "Loja Renomeada")
        self.assertEqual(loja.whatsapp, "89911112222")
        self.assertEqual(loja.descricao, "Nova descrição atualizada")
        self.assertTrue(session.committed)
        self.assertTrue(session.refreshed)

    def test_patch_parcial_preserva_outros_campos(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(lojista_id=profile.id)
        cidade_original = loja.endereco_cidade
        session = FakeSession(results=[loja])
        self.autenticar(profile=profile, session=session)

        response = self.client.patch(
            "/lojista/loja", json={"nome_loja": "Apenas Outro Nome"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(loja.nome_loja, "Apenas Outro Nome")
        self.assertEqual(loja.endereco_cidade, cidade_original)

    def test_tentativa_de_injetar_campos_protegidos_no_patch_retorna_422(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(lojista_id=profile.id)
        session = FakeSession(default_scalar=loja)
        self.autenticar(profile=profile, session=session)

        for campo in ["status", "motivo_rejeicao", "aprovado_por", "id", "lojista_id"]:
            with self.subTest(campo=campo):
                response = self.client.patch(
                    "/lojista/loja", json={campo: "valor_arbitrario"}
                )
                self.assertEqual(response.status_code, 422)

    def test_falha_de_banco_no_patch_faz_rollback(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(lojista_id=profile.id)
        session = FakeSession(results=[loja], fail_commit=True)
        self.autenticar(profile=profile, session=session)

        response = self.client.patch(
            "/lojista/loja", json={"nome_loja": "Nome Qualquer"}
        )

        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)

    # ==========================
    # FLUXO DE APROVAÇÃO (POST /lojista/loja/solicitar-aprovacao)
    # ==========================

    def test_solicitar_aprovacao_de_loja_rejeitada(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(
            lojista_id=profile.id,
            status_loja=StatusLoja.rejeitada,
            motivo_rejeicao="Faltou horário de funcionamento",
        )
        session = FakeSession(results=[loja])
        self.autenticar(profile=profile, session=session)

        response = self.client.post("/lojista/loja/solicitar-aprovacao")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(loja.status, StatusLoja.pendente)
        self.assertIsNone(loja.motivo_rejeicao)
        self.assertTrue(session.committed)

    def test_solicitar_aprovacao_de_loja_ja_aprovada_retorna_400(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(
            lojista_id=profile.id,
            status_loja=StatusLoja.aprovada,
        )
        session = FakeSession(results=[loja])
        self.autenticar(profile=profile, session=session)

        response = self.client.post("/lojista/loja/solicitar-aprovacao")

        self.assertEqual(response.status_code, 400)
        self.assertIn("já se encontra aprovada", response.json()["detail"])

    def test_solicitar_aprovacao_de_loja_ja_pendente_retorna_400(self):
        profile = criar_profile(UserRole.lojista)
        loja = criar_loja(
            lojista_id=profile.id,
            status_loja=StatusLoja.pendente,
        )
        session = FakeSession(results=[loja])
        self.autenticar(profile=profile, session=session)

        response = self.client.post("/lojista/loja/solicitar-aprovacao")

        self.assertEqual(response.status_code, 400)
        self.assertIn("já está em análise", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
