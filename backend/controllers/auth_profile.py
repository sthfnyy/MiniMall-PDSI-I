import os
import uuid
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_profile
from ..config.config import settings
from ..config.database import get_db
from ..models import Profile, UserRole

router = APIRouter(prefix="/auth", tags=["Autenticação"])

SUPABASE_URL = (
    settings.supabase_url
    or os.getenv("SUPABASE_URL", "https://fbwhpontyucoifhehysn.supabase.co")
)
SUPABASE_SERVICE_ROLE_KEY = (
    settings.supabase_service_role_key
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
)


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=2, description="Nome completo")
    email: str = Field(..., min_length=5, description="E-mail")
    password: str = Field(..., min_length=8, description="Senha de acesso")
    role: str = Field(..., description="Perfil do usuário (consumidor ou lojista)")


@router.get("/me")
async def get_me(
    profile: Profile = Depends(get_current_profile),
):
    return {
        "id": str(profile.id),
        "role": profile.role.value,
        "nome_completo": profile.nome_completo,
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    db: AsyncSession = Depends(get_db),
):
    """Cadastra um novo usuário consumidor ou lojista no Supabase Auth e inicializa o perfil."""
    normalized_role = payload.role.strip().lower()
    if normalized_role not in ["consumidor", "lojista"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecione um perfil válido (consumidor ou lojista).",
        )

    normalized_email = payload.email.strip().lower()
    trimmed_name = payload.name.strip()

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    # 1. Cria o usuário com confirmação de e-mail automática via Supabase Admin API
    try:
        async with httpx.AsyncClient() as client:
            res_user = await client.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers=headers,
                json={
                    "email": normalized_email,
                    "password": payload.password,
                    "email_confirm": True,
                    "user_metadata": {
                        "nome_completo": trimmed_name,
                        "role": normalized_role,
                    },
                },
            )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível conectar ao serviço de autenticação.",
        )

    if res_user.status_code not in (status.HTTP_200_OK, status.HTTP_201_CREATED):
        error_data = res_user.json() if res_user.text else {}
        msg = error_data.get("msg") or error_data.get("message") or ""
        if (
            "already registered" in msg.lower()
            or "already exists" in msg.lower()
            or res_user.status_code == 422
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este e-mail já está cadastrado.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg or "Não foi possível cadastrar o usuário.",
        )

    user_data = res_user.json()
    user_id = uuid.UUID(user_data["id"])
    now = datetime.now(UTC)

    # 2. Garante perfil no banco de dados com a role correta
    await db.execute(
        text("""
            INSERT INTO public.profiles (id, nome_completo, role, criado_em, atualizado_em)
            VALUES (:id, :nome, :role, :criado_em, :atualizado_em)
            ON CONFLICT (id) DO UPDATE SET
                role = EXCLUDED.role,
                nome_completo = EXCLUDED.nome_completo,
                atualizado_em = EXCLUDED.atualizado_em
        """),
        {
            "id": user_id,
            "nome": trimmed_name,
            "role": normalized_role,
            "criado_em": now,
            "atualizado_em": now,
        },
    )
    await db.commit()

    # 3. Autentica e gera a sessão imediatamente
    try:
        async with httpx.AsyncClient() as client:
            res_token = await client.post(
                f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                headers={"apikey": SUPABASE_SERVICE_ROLE_KEY},
                json={
                    "email": normalized_email,
                    "password": payload.password,
                },
            )
            token_data = res_token.json() if res_token.status_code == 200 else {}
    except httpx.HTTPError:
        token_data = {}

    return {
        "user": {
            "id": str(user_id),
            "email": normalized_email,
            "name": trimmed_name,
            "role": normalized_role,
            "status": "Ativo",
        },
        "session": token_data,
        "accessToken": token_data.get("access_token"),
    }
