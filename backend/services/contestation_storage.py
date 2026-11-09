from urllib.parse import quote

import httpx

from ..config.config import settings


BUCKET_NAME = "evidencias-contestacoes"


class ContestationStorageError(Exception):
    """Erro controlado no armazenamento privado de evidências."""


class ContestationStorage:
    def __init__(self, supabase_url=None, service_role_key=None):
        self.supabase_url = (supabase_url or settings.supabase_url or "").rstrip("/")
        self.service_role_key = service_role_key or settings.supabase_service_role_key or ""

    def _headers(self, content_type=None):
        if not self.supabase_url or not self.service_role_key:
            raise ContestationStorageError("Supabase Storage não configurado no backend")
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    async def upload(self, object_path: str, content: bytes, content_type: str) -> None:
        encoded_path = quote(object_path, safe="/")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.supabase_url}/storage/v1/object/{BUCKET_NAME}/{encoded_path}",
                    headers={**self._headers(content_type), "x-upsert": "false"},
                    content=content,
                )
                response.raise_for_status()
        except (httpx.HTTPError, ContestationStorageError) as error:
            raise ContestationStorageError("Não foi possível armazenar a evidência") from error

    async def remove(self, object_path: str) -> None:
        encoded_path = quote(object_path, safe="/")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.delete(
                    f"{self.supabase_url}/storage/v1/object/{BUCKET_NAME}/{encoded_path}",
                    headers=self._headers(),
                )
                response.raise_for_status()
        except (httpx.HTTPError, ContestationStorageError) as error:
            raise ContestationStorageError("Não foi possível remover a evidência") from error


def get_contestation_storage() -> ContestationStorage:
    return ContestationStorage()
