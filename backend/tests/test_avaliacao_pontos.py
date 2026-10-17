import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = PROJECT_ROOT / "backend" / "schemas" / "minimall_schema.sql"
MIGRATION_PATH = (
    PROJECT_ROOT
    / "backend"
    / "database"
    / "migrations"
    / "044_pontuacao_unica_por_avaliacao.sql"
)
CONTROLLER_PATH = (
    PROJECT_ROOT / "backend" / "controllers" / "consumer_avaliacoes.py"
)


def normalize_sql(sql: str) -> str:
    return re.sub(r"\s+", " ", sql.lower()).strip()


class AvaliacaoPontosDatabaseContractTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = normalize_sql(SCHEMA_PATH.read_text(encoding="utf-8"))
        cls.migration = normalize_sql(MIGRATION_PATH.read_text(encoding="utf-8"))
        cls.controller = CONTROLLER_PATH.read_text(encoding="utf-8").lower()

    def test_avaliacao_valida_aciona_credito_automaticamente(self):
        self.assertIn(
            "create trigger trg_creditar_pontos_avaliacao after insert on public.avaliacoes",
            self.schema,
        )
        self.assertIn(
            "execute function public.creditar_pontos_avaliacao()",
            self.schema,
        )

    def test_credito_pertence_ao_consumidor_da_avaliacao(self):
        self.assertIn(
            "values (new.usuario_id, new.loja_id, 'credito', 10, new.id",
            self.schema,
        )

    def test_credito_pertence_a_loja_da_avaliacao(self):
        self.assertIn(
            "insert into public.pontos_transacoes (usuario_id, loja_id, tipo, quantidade, avaliacao_id, descricao)",
            self.schema,
        )
        self.assertIn("values (new.usuario_id, new.loja_id", self.schema)

    def test_quantidade_creditada_e_dez(self):
        self.assertIn("'credito', 10, new.id", self.schema)

    def test_origem_e_descricao_sao_registradas(self):
        self.assertIn(
            "'pontos por avaliação publicada'",
            self.schema,
        )

    def test_avaliacao_id_e_registrado(self):
        self.assertIn(
            "quantidade, avaliacao_id, descricao)",
            self.schema,
        )
        self.assertIn("10, new.id, 'pontos por avaliação publicada'", self.schema)

    def test_mesma_avaliacao_nao_pode_gerar_duas_transacoes(self):
        self.assertIn(
            "create unique index if not exists uq_pontos_transacoes_avaliacao",
            self.migration,
        )
        self.assertIn("on public.pontos_transacoes (avaliacao_id)", self.migration)
        self.assertIn("where avaliacao_id is not null", self.migration)

    def test_avaliacoes_de_consumidores_diferentes_ficam_isoladas(self):
        self.assertIn("new.usuario_id", self.schema)
        self.assertIn("new.loja_id", self.schema)
        self.assertIn("new.id", self.schema)

    def test_controller_nao_duplica_regra_de_pontuacao(self):
        self.assertNotIn("pontos_transacoes", self.controller)
        self.assertNotIn("creditar_pontos", self.controller)
        self.assertNotIn("pontos por avaliação publicada", self.controller)


if __name__ == "__main__":
    unittest.main()
