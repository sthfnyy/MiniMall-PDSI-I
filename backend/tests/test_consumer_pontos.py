import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import TipoTransacaoPontos, UserRole


class FakeScalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class FakeResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return FakeScalars(self.values)


class FakeSession:
    def __init__(self, values=None, error=None):
        self.values = list(values or [])
        self.error = error
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if self.error:
            raise self.error
        return FakeResult(self.values)


def criar_profile(role=UserRole.consumidor, profile_id=None):
    return SimpleNamespace(
        id=profile_id or uuid.uuid4(),
        role=role,
        nome_completo="Consumidor",
    )


def criar_movimentacao(
    usuario_id,
    loja_id,
    tipo,
    quantidade,
    criado_em,
    descricao=None,
    avaliacao_id=None,
):
    return SimpleNamespace(
        id=uuid.uuid4(),
        usuario_id=usuario_id,
        loja_id=loja_id,
        tipo=tipo,
        quantidade=quantidade,
        avaliacao_id=avaliacao_id,
        descricao=descricao,
        criado_em=criado_em,
    )


class ConsumerPontosTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)
        self.profile = criar_profile()
        self.loja_a = uuid.uuid4()
        self.loja_b = uuid.uuid4()
        agora = datetime(2026, 10, 17, 15, 0, tzinfo=UTC)
        self.avaliacao_id = uuid.uuid4()
        self.movimentacoes = [
            criar_movimentacao(
                self.profile.id,
                self.loja_b,
                TipoTransacaoPontos.credito,
                20,
                agora,
                descricao="Crédito promocional",
            ),
            criar_movimentacao(
                self.profile.id,
                self.loja_a,
                TipoTransacaoPontos.resgate,
                4,
                agora - timedelta(hours=1),
                descricao="Resgate",
            ),
            criar_movimentacao(
                self.profile.id,
                self.loja_a,
                TipoTransacaoPontos.credito,
                10,
                agora - timedelta(days=1),
                descricao="Pontos por avaliação publicada",
                avaliacao_id=self.avaliacao_id,
            ),
        ]

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, profile=None, session=None):
        profile = profile or self.profile
        session = session or FakeSession(self.movimentacoes)

        async def override_profile():
            return profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db
        return session

    def test_consumidor_autenticado_consulta_apenas_seus_pontos(self):
        session = self.autenticar()
        response = self.client.get("/consumidor/pontos")
        self.assertEqual(response.status_code, 200)
        statement = session.statements[0]
        self.assertIn(self.profile.id, statement.compile().params.values())
        self.assertNotIn("usuario_id", response.json())

    def test_saldo_total_considera_creditos_e_resgates(self):
        self.autenticar()
        response = self.client.get("/consumidor/pontos")
        self.assertEqual(response.json()["saldo_total"], 26)

    def test_saldo_e_separado_por_loja(self):
        self.autenticar()
        response = self.client.get("/consumidor/pontos")
        saldos = {
            item["loja_id"]: item["saldo"]
            for item in response.json()["saldos_por_loja"]
        }
        self.assertEqual(saldos[str(self.loja_a)], 6)
        self.assertEqual(saldos[str(self.loja_b)], 20)

    def test_historico_retorna_creditos_e_resgates(self):
        self.autenticar()
        response = self.client.get("/consumidor/pontos")
        tipos = [item["tipo"] for item in response.json()["historico"]]
        self.assertIn("credito", tipos)
        self.assertIn("resgate", tipos)

    def test_historico_retorna_descricao_data_e_avaliacao(self):
        self.autenticar()
        response = self.client.get("/consumidor/pontos")
        item = response.json()["historico"][2]
        self.assertEqual(item["descricao"], "Pontos por avaliação publicada")
        self.assertEqual(item["avaliacao_id"], str(self.avaliacao_id))
        self.assertEqual(item["criado_em"], "2026-10-16T15:00:00Z")

    def test_historico_e_ordenado_do_mais_recente(self):
        session = self.autenticar()
        response = self.client.get("/consumidor/pontos")
        datas = [item["criado_em"] for item in response.json()["historico"]]
        self.assertEqual(datas, sorted(datas, reverse=True))
        self.assertIn(
            "ORDER BY pontos_transacoes.criado_em DESC",
            str(session.statements[0]),
        )

    def test_consumidor_nao_escolhe_outro_usuario_por_query_param(self):
        session = self.autenticar()
        outro_usuario = uuid.uuid4()
        response = self.client.get(
            f"/consumidor/pontos?usuario_id={outro_usuario}"
        )
        self.assertEqual(response.status_code, 200)
        params = session.statements[0].compile().params.values()
        self.assertIn(self.profile.id, params)
        self.assertNotIn(outro_usuario, params)

    def test_sem_autenticacao_retorna_401(self):
        response = self.client.get("/consumidor/pontos")
        self.assertEqual(response.status_code, 401)

    def test_lojista_e_admin_retorna_403(self):
        for role in (UserRole.lojista, UserRole.admin):
            with self.subTest(role=role):
                app.dependency_overrides.clear()
                self.autenticar(criar_profile(role=role), FakeSession())
                response = self.client.get("/consumidor/pontos")
                self.assertEqual(response.status_code, 403)

    def test_perfil_inexistente_retorna_404(self):
        async def profile_inexistente():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado para este usuário",
            )

        app.dependency_overrides[get_current_profile] = profile_inexistente
        response = self.client.get("/consumidor/pontos")
        self.assertEqual(response.status_code, 404)

    def test_sem_movimentacoes_retorna_saldos_e_historico_vazios(self):
        self.autenticar(session=FakeSession())
        response = self.client.get("/consumidor/pontos")
        self.assertEqual(
            response.json(),
            {"saldo_total": 0, "saldos_por_loja": [], "historico": []},
        )

    def test_falha_de_consulta_retorna_500(self):
        self.autenticar(session=FakeSession(error=SQLAlchemyError("falha")))
        response = self.client.get("/consumidor/pontos")
        self.assertEqual(response.status_code, 500)


if __name__ == "__main__":
    unittest.main()
