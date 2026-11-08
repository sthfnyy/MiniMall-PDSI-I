import unittest
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from backend.auth import get_current_profile, get_lojista_loja
from backend.config.database import get_db
from backend.main import app
from backend.models import Categoria, Loja, Produto, ProdutoFoto, Profile, StatusLoja, UserRole, VariacaoProduto
from backend.services.product_storage import (
    ProductStorageError,
    get_product_storage,
)

JPEG = b"\xff\xd8\xff\xe0" + b"jpeg_dummy_data_for_test"
PNG = b"\x89PNG\r\n\x1a\n" + b"png_dummy_data_for_test"
WEBP = b"RIFF\x04\x00\x00\x00WEBP" + b"webp_dummy_data_for_test"


class FakeScalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values

    def first(self):
        return self.values[0] if self.values else None


class FakeResult:
    def __init__(self, scalar=None, scalars=None):
        self.scalar_value = scalar
        self.scalar_values = list(scalars or [])

    def scalar_one_or_none(self):
        return self.scalar_value

    def scalar_one(self):
        return self.scalar_value

    def scalars(self):
        return FakeScalars(self.scalar_values)


class FakeSession:
    def __init__(self, results=None, fail_commit=False):
        self.results = list(results or [])
        self.fail_commit = fail_commit
        self.statements = []
        self.added = []
        self.deleted = []
        self.committed = False
        self.refreshed = False
        self.rolled_back = False

    async def execute(self, statement):
        self.statements.append(statement)
        if self.results:
            return self.results.pop(0)
        return FakeResult(scalar=None)

    def add(self, instance):
        self.added.append(instance)

    async def delete(self, instance):
        self.deleted.append(instance)

    async def commit(self):
        if self.fail_commit:
            raise SQLAlchemyError("falha simulada")
        self.committed = True

    async def refresh(self, instance):
        self.refreshed = True

    async def rollback(self):
        self.rolled_back = True


class FakeProductStorage:
    def __init__(self, fail_upload=False, fail_remove=False):
        self.fail_upload = fail_upload
        self.fail_remove = fail_remove
        self.uploaded = []
        self.removed = []

    async def upload(self, path, content, content_type):
        if self.fail_upload:
            raise ProductStorageError("Falha simulada no upload")
        self.uploaded.append((path, content, content_type))
        return f"https://example.supabase.co/storage/v1/object/public/fotos-produtos/{path}"

    def object_path(self, url):
        marker = "/fotos-produtos/"
        if marker not in url:
            raise ProductStorageError("URL inválida")
        return url.split(marker, 1)[1]

    async def remove(self, path):
        if self.fail_remove:
            raise ProductStorageError("Falha simulada na remoção")
        self.removed.append(path)


def criar_profile(role=UserRole.lojista, user_id=None):
    return SimpleNamespace(
        id=user_id or uuid.uuid4(),
        role=role,
        nome_completo="Lojista Teste",
        telefone="89999999999",
        avatar_url=None,
        criado_em=datetime.now(UTC),
        atualizado_em=datetime.now(UTC),
    )


def criar_loja(lojista_id, loja_id=None):
    return SimpleNamespace(
        id=loja_id or uuid.uuid4(),
        lojista_id=lojista_id,
        nome_loja="Minha Loja",
        descricao="Descrição da loja",
        endereco_cidade="Picos",
        endereco_uf="PI",
        whatsapp="89988887777",
        status=StatusLoja.aprovada,
        criado_em=datetime.now(UTC),
        atualizado_em=datetime.now(UTC),
    )


def criar_produto(loja_id, produto_id=None, categoria_id=None, preco_base=Decimal("100.00"), preco_promo=None):
    return SimpleNamespace(
        id=produto_id or uuid.uuid4(),
        loja_id=loja_id,
        categoria_id=categoria_id or uuid.uuid4(),
        titulo="Camisa Polo",
        descricao="Camisa 100% algodão",
        preco_base=preco_base,
        preco_promocional=preco_promo,
        foto_principal_url="https://example.com/polo.jpg",
        ativo=True,
        criado_em=datetime.now(UTC),
        atualizado_em=datetime.now(UTC),
    )


class LojistaProdutosTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, profile=None, loja=None, session=None, storage=None):
        profile = profile or criar_profile()
        loja = loja or criar_loja(profile.id)
        session = session or FakeSession()
        storage = storage or FakeProductStorage()

        async def override_profile():
            return profile

        async def override_loja():
            return loja

        async def override_db():
            yield session

        def override_storage():
            return storage

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_lojista_loja] = override_loja
        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_product_storage] = override_storage

        return profile, loja, session, storage

    # ============================
    # 1. LISTAGEM (GET /lojista/produtos)
    # ============================

    def test_lojista_lista_produtos_sucesso(self):
        profile, loja, _, _ = self.autenticar()
        cat_id = uuid.uuid4()
        categoria = SimpleNamespace(id=cat_id, nome="Vestuário")
        prod = criar_produto(loja.id, categoria_id=cat_id)
        foto = SimpleNamespace(
            id=uuid.uuid4(),
            produto_id=prod.id,
            url="https://example.com/foto1.jpg",
            ordem=0,
            criado_em=datetime.now(UTC),
        )
        var = SimpleNamespace(
            id=uuid.uuid4(),
            produto_id=prod.id,
            tamanho="M",
            cor="Azul",
            preco=None,
            sku="POLO-M-AZ",
            ativo=True,
        )

        session = FakeSession([
            FakeResult(scalars=[prod]),      # Busca produtos
            FakeResult(scalars=[categoria]), # Busca categorias
            FakeResult(scalars=[foto]),      # Busca fotos
            FakeResult(scalars=[var]),       # Busca variações
        ])
        self.autenticar(profile=profile, loja=loja, session=session)

        response = self.client.get("/lojista/produtos")

        self.assertEqual(response.status_code, 200)
        dados = response.json()
        self.assertEqual(len(dados), 1)
        self.assertEqual(dados[0]["id"], str(prod.id))
        self.assertEqual(dados[0]["categoria_nome"], "Vestuário")
        self.assertEqual(len(dados[0]["fotos"]), 1)
        self.assertEqual(len(dados[0]["variacoes"]), 1)

    def test_consumidor_recebe_403_ao_acessar_produtos(self):
        profile = criar_profile(role=UserRole.consumidor)

        async def override_consumer():
            return profile

        app.dependency_overrides[get_current_profile] = override_consumer

        response = self.client.get("/lojista/produtos")
        self.assertEqual(response.status_code, 403)
        self.assertIn("Acesso restrito a lojistas", response.json()["detail"])

    def test_usuario_nao_autenticado_recebe_401(self):
        response = self.client.get("/lojista/produtos")
        self.assertEqual(response.status_code, 401)

    # ============================
    # 2. CRIAÇÃO (POST /lojista/produtos)
    # ============================

    def test_lojista_cria_produto_sucesso(self):
        profile, loja, _, _ = self.autenticar()
        cat_id = uuid.uuid4()
        categoria = SimpleNamespace(id=cat_id, nome="Calçados")

        session = FakeSession([
            FakeResult(scalar=categoria),    # Valida categoria
            FakeResult(scalars=[categoria]), # Carrega categoria para output
            FakeResult(scalars=[]),          # Fotos
            FakeResult(scalars=[]),          # Variações
        ])
        self.autenticar(profile=profile, loja=loja, session=session)

        payload = {
            "categoria_id": str(cat_id),
            "titulo": "Tênis Esportivo",
            "descricao": "Tênis leve para corrida",
            "preco_base": 199.90,
            "preco_promocional": 149.90,
            "foto_principal_url": "https://example.com/tenis.jpg",
            "ativo": True,
            "variacoes": [
                {"tamanho": "40", "cor": "Preto", "sku": "TENIS-40-PR"},
                {"tamanho": "41", "cor": "Preto", "sku": "TENIS-41-PR"},
            ],
        }

        response = self.client.post("/lojista/produtos", json=payload)

        self.assertEqual(response.status_code, 201)
        dados = response.json()
        self.assertEqual(dados["titulo"], "Tênis Esportivo")
        self.assertEqual(dados["loja_id"], str(loja.id))
        self.assertEqual(float(dados["preco_promocional"]), 149.90)
        self.assertTrue(session.committed)
        self.assertEqual(len(session.added), 3)  # 1 produto + 2 variações

    def test_lojista_cria_produto_categoria_inexistente_retorna_400(self):
        session = FakeSession([FakeResult(scalar=None)])  # Categoria inexistente
        self.autenticar(session=session)

        payload = {
            "categoria_id": str(uuid.uuid4()),
            "titulo": "Produto Qualquer",
            "preco_base": 50.00,
        }

        response = self.client.post("/lojista/produtos", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Categoria informada não existe", response.json()["detail"])

    def test_lojista_cria_produto_promocao_maior_ou_igual_preco_base_retorna_422(self):
        self.autenticar()

        for preco_base, preco_promo in [(100.00, 100.00), (100.00, 120.00)]:
            with self.subTest(base=preco_base, promo=preco_promo):
                payload = {
                    "categoria_id": str(uuid.uuid4()),
                    "titulo": "Produto Promo Errada",
                    "preco_base": preco_base,
                    "preco_promocional": preco_promo,
                }
                response = self.client.post("/lojista/produtos", json=payload)
                self.assertEqual(response.status_code, 422)

    def test_lojista_cria_produto_titulo_invalido_retorna_422(self):
        self.autenticar()

        for titulo in ["", " ", "a"]:
            with self.subTest(titulo=titulo):
                payload = {
                    "categoria_id": str(uuid.uuid4()),
                    "titulo": titulo,
                    "preco_base": 50.00,
                }
                response = self.client.post("/lojista/produtos", json=payload)
                self.assertEqual(response.status_code, 422)

    def test_tentativa_de_injetar_loja_id_retorna_422(self):
        self.autenticar()

        payload = {
            "categoria_id": str(uuid.uuid4()),
            "titulo": "Produto Hacker",
            "preco_base": 50.00,
            "loja_id": str(uuid.uuid4()),  # Campo proibido
        }
        response = self.client.post("/lojista/produtos", json=payload)
        self.assertEqual(response.status_code, 422)

    # ============================
    # 3. CONSULTA ESPECÍFICA (GET /lojista/produtos/{id})
    # ============================

    def test_lojista_consulta_proprio_produto_sucesso(self):
        profile, loja, _, _ = self.autenticar()
        cat_id = uuid.uuid4()
        categoria = SimpleNamespace(id=cat_id, nome="Acessórios")
        prod = criar_produto(loja.id, categoria_id=cat_id)

        session = FakeSession([
            FakeResult(scalar=prod),         # Busca produto
            FakeResult(scalars=[categoria]), # Busca categoria
            FakeResult(scalars=[]),          # Fotos
            FakeResult(scalars=[]),          # Variações
        ])
        self.autenticar(profile=profile, loja=loja, session=session)

        response = self.client.get(f"/lojista/produtos/{prod.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(prod.id))

    def test_lojista_consulta_produto_de_outra_loja_retorna_404(self):
        session = FakeSession([FakeResult(scalar=None)])  # Não encontrado na loja logada
        self.autenticar(session=session)

        response = self.client.get(f"/lojista/produtos/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Produto não encontrado no catálogo da sua loja", response.json()["detail"])

    # ============================
    # 4. ATUALIZAÇÃO (PATCH /lojista/produtos/{id})
    # ============================

    def test_lojista_atualiza_produto_sucesso(self):
        profile, loja, _, _ = self.autenticar()
        cat_id = uuid.uuid4()
        categoria = SimpleNamespace(id=cat_id, nome="Geral")
        prod = criar_produto(loja.id, categoria_id=cat_id, preco_base=Decimal("100.00"))

        session = FakeSession([
            FakeResult(scalar=prod),         # Busca produto
            FakeResult(scalars=[categoria]), # Carrega categoria
            FakeResult(scalars=[]),          # Fotos
            FakeResult(scalars=[]),          # Variações
        ])
        self.autenticar(profile=profile, loja=loja, session=session)

        payload = {
            "titulo": "Novo Nome do Produto",
            "preco_promocional": 79.90,
        }

        response = self.client.patch(f"/lojista/produtos/{prod.id}", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(prod.titulo, "Novo Nome do Produto")
        self.assertEqual(prod.preco_promocional, Decimal("79.90"))
        self.assertTrue(session.committed)

    def test_lojista_atualiza_promocao_maior_que_preco_existente_retorna_422(self):
        profile, loja, _, _ = self.autenticar()
        prod = criar_produto(loja.id, preco_base=Decimal("50.00"))

        session = FakeSession([FakeResult(scalar=prod)])
        self.autenticar(profile=profile, loja=loja, session=session)

        payload = {"preco_promocional": 60.00}  # Maior que preco_base existente (50.00)
        response = self.client.patch(f"/lojista/produtos/{prod.id}", json=payload)

        self.assertEqual(response.status_code, 422)
        self.assertIn("O preço promocional deve ser menor que o preço base", response.json()["detail"])

    def test_lojista_atualiza_produto_de_outra_loja_retorna_404(self):
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(session=session)

        response = self.client.patch(f"/lojista/produtos/{uuid.uuid4()}", json={"titulo": "Tentativa"})
        self.assertEqual(response.status_code, 404)

    # ============================
    # 5. EXCLUSÃO (DELETE /lojista/produtos/{id})
    # ============================

    def test_lojista_exclui_produto_sucesso(self):
        profile, loja, _, _ = self.autenticar()
        prod = criar_produto(loja.id)

        session = FakeSession([FakeResult(scalar=prod)])
        self.autenticar(profile=profile, loja=loja, session=session)

        response = self.client.delete(f"/lojista/produtos/{prod.id}")

        self.assertEqual(response.status_code, 200)
        self.assertIn(prod, session.deleted)
        self.assertTrue(session.committed)

    def test_lojista_exclui_produto_de_outra_loja_retorna_404(self):
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(session=session)

        response = self.client.delete(f"/lojista/produtos/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 404)

    # ============================
    # 6. UPLOAD E REMOÇÃO DE FOTOS
    # ============================

    def test_upload_foto_produto_sucesso(self):
        profile, loja, _, storage = self.autenticar()
        prod = criar_produto(loja.id)
        prod.foto_principal_url = None  # Sem foto principal ainda

        session = FakeSession([
            FakeResult(scalar=prod),  # Busca produto
            FakeResult(scalar=0),     # Count fotos para ordem
        ])
        self.autenticar(profile=profile, loja=loja, session=session, storage=storage)

        response = self.client.post(
            f"/lojista/produtos/{prod.id}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(storage.uploaded), 1)
        self.assertTrue(session.committed)
        self.assertTrue(prod.foto_principal_url.startswith("https://"))

    def test_upload_foto_produto_outra_loja_retorna_404(self):
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(session=session)

        response = self.client.post(
            f"/lojista/produtos/{uuid.uuid4()}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 404)

    def test_upload_foto_arquivo_vazio_retorna_422(self):
        profile, loja, _, _ = self.autenticar()
        prod = criar_produto(loja.id)
        session = FakeSession([FakeResult(scalar=prod)])
        self.autenticar(profile=profile, loja=loja, session=session)

        response = self.client.post(
            f"/lojista/produtos/{prod.id}/fotos",
            files={"arquivo": ("vazio.jpg", b"", "image/jpeg")},
        )
        self.assertEqual(response.status_code, 422)

    def test_upload_foto_formato_invalido_retorna_415(self):
        profile, loja, _, _ = self.autenticar()
        prod = criar_produto(loja.id)
        session = FakeSession([FakeResult(scalar=prod)])
        self.autenticar(profile=profile, loja=loja, session=session)

        response = self.client.post(
            f"/lojista/produtos/{prod.id}/fotos",
            files={"arquivo": ("arquivo.gif", b"GIF89a...", "image/gif")},
        )
        self.assertEqual(response.status_code, 415)

    def test_remover_foto_produto_sucesso(self):
        profile, loja, _, storage = self.autenticar()
        prod = criar_produto(loja.id)
        foto_id = uuid.uuid4()
        foto_url = f"https://example.supabase.co/storage/v1/object/public/fotos-produtos/{loja.id}/{prod.id}/{foto_id}.jpg"
        foto = SimpleNamespace(id=foto_id, produto_id=prod.id, url=foto_url)
        prod.foto_principal_url = foto_url

        session = FakeSession([
            FakeResult(scalar=prod),  # Busca produto
            FakeResult(scalar=foto),  # Busca foto
            FakeResult(scalars=[]),   # Outra foto para foto principal
        ])
        self.autenticar(profile=profile, loja=loja, session=session, storage=storage)

        response = self.client.delete(f"/lojista/produtos/{prod.id}/fotos/{foto_id}")

        self.assertEqual(response.status_code, 200)
        self.assertIn(foto, session.deleted)
        self.assertEqual(len(storage.removed), 1)
        self.assertIsNone(prod.foto_principal_url)

    def test_upload_foto_avulsa_sucesso(self):
        _, _, _, storage = self.autenticar()

        response = self.client.post(
            "/lojista/produtos/upload-foto",
            files={"arquivo": ("preview.png", PNG, "image/png")},
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["url"].startswith("https://"))
        self.assertEqual(len(storage.uploaded), 1)

    def test_listar_categorias_lojista_sucesso(self):
        categoria = Categoria(id=uuid.uuid4(), nome="Vestuário")
        session = FakeSession([FakeResult(scalars=[categoria])])
        self.autenticar(session=session)

        response = self.client.get("/lojista/produtos/categorias")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["nome"], "Vestuário")


if __name__ == "__main__":
    unittest.main()
