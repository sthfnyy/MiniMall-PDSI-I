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
from backend.services.review_storage import ReviewStorageError, get_review_storage


JPEG = b"\xff\xd8\xff\xe0" + b"jpeg"
PNG = b"\x89PNG\r\n\x1a\n" + b"png"
WEBP = b"RIFF\x04\x00\x00\x00WEBP" + b"webp"


class FakeScalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


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
        if self.fail_commit:
            raise SQLAlchemyError("falha")
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


class FakeStorage:
    def __init__(self, fail_upload=False, fail_download=False, fail_remove=False):
        self.fail_upload = fail_upload
        self.fail_download = fail_download
        self.fail_remove = fail_remove
        self.uploaded = []
        self.downloaded = []
        self.removed = []

    async def upload(self, path, content, content_type):
        if self.fail_upload:
            raise ReviewStorageError("Falha simulada no Storage")
        self.uploaded.append((path, content, content_type))
        return f"https://example.supabase.co/storage/v1/object/public/fotos-avaliacoes/{path}"

    def object_path(self, url):
        marker = "/fotos-avaliacoes/"
        if marker not in url:
            raise ReviewStorageError("URL inválida")
        return url.split(marker, 1)[1]

    async def download(self, path):
        if self.fail_download:
            raise ReviewStorageError("Falha simulada no Storage")
        self.downloaded.append(path)
        return JPEG, "image/jpeg"

    async def remove(self, path):
        if self.fail_remove:
            raise ReviewStorageError("Falha simulada no Storage")
        self.removed.append(path)


def profile(role=UserRole.consumidor):
    return SimpleNamespace(id=uuid.uuid4(), role=role, nome_completo="Pessoa")


def avaliacao(owner_id, avaliacao_id=None):
    return SimpleNamespace(
        id=avaliacao_id or uuid.uuid4(),
        loja_id=uuid.uuid4(),
        usuario_id=owner_id,
        nota=5,
        comentario="Ótima",
        foto_url="",
        criado_em=datetime(2026, 10, 17, tzinfo=UTC),
    )


def foto(avaliacao_id, foto_id=None):
    foto_id = foto_id or uuid.uuid4()
    path = f"usuario/{avaliacao_id}/{foto_id}.jpg"
    return SimpleNamespace(
        id=foto_id,
        avaliacao_id=avaliacao_id,
        url=f"https://example.supabase.co/storage/v1/object/public/fotos-avaliacoes/{path}",
        criado_em=datetime(2026, 10, 17, tzinfo=UTC),
    )


class ConsumerAvaliacaoFotosTestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, current_profile=None, session=None, storage=None):
        current_profile = current_profile or profile()
        session = session or FakeSession()
        storage = storage or FakeStorage()

        async def override_profile():
            return current_profile

        async def override_db():
            yield session

        app.dependency_overrides[get_current_profile] = override_profile
        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_review_storage] = lambda: storage
        return current_profile, session, storage

    def enviar(self, content=JPEG, filename="foto.jpg", mime="image/jpeg", count=0):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        session = FakeSession([FakeResult(scalar=review), FakeResult(scalar=count)])
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.post(
            f"/consumidor/avaliacoes/{review.id}/fotos",
            files={"arquivo": (filename, content, mime)},
        )
        return response, current_profile, review, session, storage

    def test_upload_valido_jpeg(self):
        response, _, _, _, storage = self.enviar()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(storage.uploaded[0][2], "image/jpeg")
        self.assertTrue(storage.uploaded[0][0].endswith(".jpg"))

    def test_upload_valido_png(self):
        response, _, _, _, storage = self.enviar(PNG, "foto.png", "image/png")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(storage.uploaded[0][0].endswith(".png"))

    def test_upload_valido_webp(self):
        response, _, _, _, storage = self.enviar(WEBP, "foto.webp", "image/webp")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(storage.uploaded[0][0].endswith(".webp"))

    def test_arquivo_vazio(self):
        response, *_ = self.enviar(b"")
        self.assertEqual(response.status_code, 422)

    def test_arquivo_maior_que_cinco_mb(self):
        response, *_ = self.enviar(JPEG + b"x" * (5 * 1024 * 1024))
        self.assertEqual(response.status_code, 413)

    def test_mime_nao_permitido(self):
        response, *_ = self.enviar(JPEG, "foto.gif", "image/gif")
        self.assertEqual(response.status_code, 415)

    def test_extensao_falsa(self):
        response, *_ = self.enviar(JPEG, "foto.png", "image/jpeg")
        self.assertEqual(response.status_code, 415)

    def test_conteudo_incompativel_com_mime(self):
        response, *_ = self.enviar(PNG, "foto.jpg", "image/jpeg")
        self.assertEqual(response.status_code, 415)

    def test_avaliacao_inexistente(self):
        current_profile = profile()
        session = FakeSession([FakeResult(scalar=None)])
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.post(
            f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(storage.uploaded, [])

    def test_avaliacao_de_outro_consumidor(self):
        current_profile = profile()
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(current_profile, session)
        response = self.client.post(
            f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn(current_profile.id, session.statements[0].compile().params.values())

    def test_jwt_ausente(self):
        response = self.client.post(
            f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 401)

    def test_usuario_invalido(self):
        async def invalid_profile():
            raise HTTPException(status_code=404, detail="Perfil não encontrado")

        app.dependency_overrides[get_current_profile] = invalid_profile
        response = self.client.post(
            f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 404)

    def test_lojista_e_admin_nao_acessam(self):
        for role in (UserRole.lojista, UserRole.admin):
            with self.subTest(role=role):
                app.dependency_overrides.clear()
                self.autenticar(profile(role=role))
                response = self.client.post(
                    f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos",
                    files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
                )
                self.assertEqual(response.status_code, 403)

    def test_associacao_correta_e_usuario_nao_controlado_pelo_cliente(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        session = FakeSession([FakeResult(scalar=review), FakeResult(scalar=0)])
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.post(
            f"/consumidor/avaliacoes/{review.id}/fotos",
            data={"usuario_id": str(uuid.uuid4())},
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(session.added[0].avaliacao_id, review.id)
        self.assertFalse(hasattr(session.added[0], "usuario_id"))
        self.assertTrue(storage.uploaded[0][0].startswith(f"{current_profile.id}/{review.id}/"))
        self.assertIn("FOR UPDATE", str(session.statements[0]))

    def test_primeiro_segundo_e_terceiro_upload_sao_aceitos(self):
        for existing_count in (0, 1, 2):
            with self.subTest(existing_count=existing_count):
                response, *_ = self.enviar(count=existing_count)
                self.assertEqual(response.status_code, 201)

    def test_quarto_upload_e_rejeitado(self):
        response, _, _, _, storage = self.enviar(count=3)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(storage.uploaded, [])

    def test_falha_no_storage(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        session = FakeSession([FakeResult(scalar=review), FakeResult(scalar=0)])
        storage = FakeStorage(fail_upload=True)
        self.autenticar(current_profile, session, storage)
        response = self.client.post(
            f"/consumidor/avaliacoes/{review.id}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(session.added, [])
        self.assertTrue(session.rolled_back)

    def test_falha_na_persistencia_remove_objeto_enviado(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        session = FakeSession(
            [FakeResult(scalar=review), FakeResult(scalar=0)],
            fail_commit=True,
        )
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.post(
            f"/consumidor/avaliacoes/{review.id}/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)
        self.assertEqual(storage.removed, [storage.uploaded[0][0]])

    def test_get_avaliacao_sem_fotos(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        session = FakeSession([FakeResult(scalars=[review]), FakeResult(scalars=[])])
        self.autenticar(current_profile, session)
        response = self.client.get("/consumidor/avaliacoes")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["fotos"], [])

    def test_get_avaliacao_com_fotos(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        review_photo = foto(review.id)
        session = FakeSession([
            FakeResult(scalars=[review]),
            FakeResult(scalars=[review_photo]),
        ])
        self.autenticar(current_profile, session)
        response = self.client.get("/consumidor/avaliacoes")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["fotos"][0]["id"], str(review_photo.id))
        self.assertNotIn("usuario_id", response.json()[0])

    def test_remove_propria_foto_e_objeto_fisico(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        review_photo = foto(review.id)
        session = FakeSession([FakeResult(scalar=review_photo)])
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.delete(
            f"/consumidor/avaliacoes/{review.id}/fotos/{review_photo.id}"
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(session.deleted, [review_photo])
        self.assertEqual(storage.downloaded, storage.removed)

    def test_remove_foto_de_outro_consumidor(self):
        current_profile = profile()
        session = FakeSession([FakeResult(scalar=None)])
        self.autenticar(current_profile, session)
        response = self.client.delete(
            f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos/{uuid.uuid4()}"
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn(current_profile.id, session.statements[0].compile().params.values())

    def test_remove_foto_inexistente(self):
        current_profile = profile()
        session = FakeSession([FakeResult(scalar=None)])
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.delete(
            f"/consumidor/avaliacoes/{uuid.uuid4()}/fotos/{uuid.uuid4()}"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(storage.removed, [])

    def test_uuid_invalido(self):
        self.autenticar()
        upload = self.client.post(
            "/consumidor/avaliacoes/invalido/fotos",
            files={"arquivo": ("foto.jpg", JPEG, "image/jpeg")},
        )
        delete = self.client.delete(
            f"/consumidor/avaliacoes/invalido/fotos/{uuid.uuid4()}"
        )
        self.assertEqual(upload.status_code, 422)
        self.assertEqual(delete.status_code, 422)

    def test_falha_no_storage_na_remocao_preserva_registro(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        review_photo = foto(review.id)
        session = FakeSession([FakeResult(scalar=review_photo)])
        storage = FakeStorage(fail_remove=True)
        self.autenticar(current_profile, session, storage)
        response = self.client.delete(
            f"/consumidor/avaliacoes/{review.id}/fotos/{review_photo.id}"
        )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(session.deleted, [])
        self.assertTrue(session.rolled_back)

    def test_falha_no_banco_ao_remover_restaura_objeto(self):
        current_profile = profile()
        review = avaliacao(current_profile.id)
        review_photo = foto(review.id)
        session = FakeSession([FakeResult(scalar=review_photo)], fail_commit=True)
        _, _, storage = self.autenticar(current_profile, session)
        response = self.client.delete(
            f"/consumidor/avaliacoes/{review.id}/fotos/{review_photo.id}"
        )
        self.assertEqual(response.status_code, 500)
        self.assertTrue(session.rolled_back)
        self.assertEqual(storage.uploaded[0][0], storage.removed[0])


if __name__ == "__main__":
    unittest.main()
