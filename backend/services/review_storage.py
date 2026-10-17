from urllib.parse import quote, unquote, urlparse

import httpx

from ..config.config import settings


BUCKET_NAME = "fotos-avaliacoes"


class ReviewStorageError(Exception):
    """Erro controlado ao acessar o Storage de fotos de avaliações."""


class ReviewStorage:
    def __init__(
        self,
        supabase_url: str | None = None,
        service_role_key: str | None = None,
    ):
        self.supabase_url = (supabase_url or settings.supabase_url or "").rstrip("/")
        self.service_role_key = service_role_key or settings.supabase_service_role_key or ""

    def _ensure_configured(self) -> None:
        if not self.supabase_url or not self.service_role_key:
            raise ReviewStorageError("Supabase Storage não configurado no backend")

    def _headers(self, content_type: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def public_url(self, object_path: str) -> str:
        self._ensure_configured()
        encoded_path = quote(object_path, safe="/")
        return (
            f"{self.supabase_url}/storage/v1/object/public/"
            f"{BUCKET_NAME}/{encoded_path}"
        )

    def object_path(self, public_url: str) -> str:
        self._ensure_configured()
        expected_prefix = f"/storage/v1/object/public/{BUCKET_NAME}/"
        parsed = urlparse(public_url)
        if (
            f"{parsed.scheme}://{parsed.netloc}" != self.supabase_url
            or not parsed.path.startswith(expected_prefix)
        ):
            raise ReviewStorageError("URL de foto inválida para o bucket configurado")
        path = unquote(parsed.path[len(expected_prefix):])
        if not path or any(part in ("", ".", "..") for part in path.split("/")):
            raise ReviewStorageError("Caminho de foto inválido")
        return path

    async def upload(self, object_path: str, content: bytes, content_type: str) -> str:
        self._ensure_configured()
        encoded_path = quote(object_path, safe="/")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.supabase_url}/storage/v1/object/{BUCKET_NAME}/{encoded_path}",
                    headers={**self._headers(content_type), "x-upsert": "false"},
                    content=content,
                )
                response.raise_for_status()
        except httpx.HTTPError as error:
            raise ReviewStorageError("Não foi possível armazenar a foto") from error
        return self.public_url(object_path)

    async def download(self, object_path: str) -> tuple[bytes, str]:
        self._ensure_configured()
        encoded_path = quote(object_path, safe="/")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    f"{self.supabase_url}/storage/v1/object/{BUCKET_NAME}/{encoded_path}",
                    headers=self._headers(),
                )
                response.raise_for_status()
        except httpx.HTTPError as error:
            raise ReviewStorageError("Não foi possível obter a foto para remoção") from error
        return response.content, response.headers.get("content-type", "application/octet-stream")

    async def remove(self, object_path: str) -> None:
        self._ensure_configured()
        encoded_path = quote(object_path, safe="/")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.delete(
                    f"{self.supabase_url}/storage/v1/object/{BUCKET_NAME}/{encoded_path}",
                    headers=self._headers(),
                )
                response.raise_for_status()
        except httpx.HTTPError as error:
            raise ReviewStorageError("Não foi possível remover a foto") from error


def get_review_storage() -> ReviewStorage:
    return ReviewStorage()
