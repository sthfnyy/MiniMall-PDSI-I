from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import Profile
from ..schemas import ConsumerProfileOut, ConsumerProfileUpdate

router = APIRouter(prefix="/consumidor/perfil", tags=["consumidor - perfil"])


@router.get("", response_model=ConsumerProfileOut)
async def consultar_perfil(
    profile: Profile = Depends(require_consumer),
):
    return profile


@router.patch("", response_model=ConsumerProfileOut)
async def atualizar_perfil(
    payload: ConsumerProfileUpdate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(profile, campo, valor)

    profile.atualizado_em = datetime.now(UTC)

    try:
        await db.commit()
        await db.refresh(profile)
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível atualizar o perfil",
        )

    return profile
