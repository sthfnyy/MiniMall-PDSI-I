import uuid

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config.database import get_db
from .models import Profile, UserRole

security = HTTPBearer()

SUPABASE_JWKS_URL = (
    "https://fbwhpontyucoifhehysn.supabase.co/auth/v1/.well-known/jwks.json"
)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> uuid.UUID:
    """Valida o JWT ES256 emitido pelo Supabase Auth."""

    token = credentials.credentials

    try:
        # Busca as chaves públicas do Supabase
        async with httpx.AsyncClient() as client:
            response = await client.get(SUPABASE_JWKS_URL)
            response.raise_for_status()
            jwks = response.json()

        # Descobre qual chave corresponde ao 'kid' do token
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        key = next(
            (key for key in jwks["keys"] if key.get("kid") == kid),
            None,
        )

        if key is None:
            raise JWTError("Chave pública correspondente ao kid não encontrada")

        # Valida assinatura e claims
        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            audience="authenticated",
        )

    except (JWTError, httpx.HTTPError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )

    sub = payload.get("sub")

    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem identificador de usuário",
        )

    try:
        return uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificador de usuário inválido",
        )


async def get_current_profile(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Profile:
    result = await db.execute(
        select(Profile).where(Profile.id == user_id)
    )

    profile = result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado para este usuário",
        )

    return profile


async def require_admin(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    """Permite acesso às rotas administrativas somente para admins."""

    if profile.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores",
        )

    return profile