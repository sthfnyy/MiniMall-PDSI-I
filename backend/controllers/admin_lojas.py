import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import Loja, Profile, StatusLoja, UserRole
from ..schemas import LojaOut, RejeitarLojaIn

router = APIRouter(prefix="/admin/lojas", tags=["admin - moderação de lojas"])


@router.get("", response_model=list[LojaOut])
async def listar_lojas(
    status_filtro: StatusLoja | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):

    query = select(Loja).order_by(Loja.criado_em.desc())
    if status_filtro is not None:
        query = query.where(Loja.status == status_filtro)
    result = await db.execute(query)
    return result.scalars().all()


async def _buscar_loja_ou_404(loja_id: uuid.UUID, db: AsyncSession) -> Loja:
    result = await db.execute(select(Loja).where(Loja.id == loja_id))
    loja = result.scalar_one_or_none()
    if loja is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loja não encontrada")
    return loja


@router.patch("/{loja_id}/aprovar", response_model=LojaOut)
async def aprovar_loja(
    loja_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Profile = Depends(require_admin),
):
    loja = await _buscar_loja_ou_404(loja_id, db)
    loja.status = StatusLoja.aprovada
    loja.aprovado_por = admin.id
    loja.aprovado_em = datetime.now(UTC)
    loja.motivo_rejeicao = None
    await db.commit()
    await db.refresh(loja)
    return loja


@router.patch("/{loja_id}/rejeitar", response_model=LojaOut)
async def rejeitar_loja(
    loja_id: uuid.UUID,
    payload: RejeitarLojaIn,
    db: AsyncSession = Depends(get_db),
    admin: Profile = Depends(require_admin),
):
    loja = await _buscar_loja_ou_404(loja_id, db)
    loja.status = StatusLoja.rejeitada
    loja.aprovado_por = admin.id
    loja.aprovado_em = datetime.now(UTC)
    loja.motivo_rejeicao = payload.motivo_rejeicao
    await db.commit()
    await db.refresh(loja)
    return loja
