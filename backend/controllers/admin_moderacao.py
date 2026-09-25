import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import Avaliacao, AvaliacaoFoto, Profile
from ..schemas import AvaliacaoOut

router = APIRouter(prefix="/admin/moderacao", tags=["admin - moderação de avaliações"])


@router.get("/avaliacoes", response_model=list[AvaliacaoOut])
async def listar_avaliacoes(
    loja_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    query = select(Avaliacao).order_by(Avaliacao.criado_em.desc())
    if loja_id is not None:
        query = query.where(Avaliacao.loja_id == loja_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/avaliacoes/{avaliacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_avaliacao(
    avaliacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    """Remove a avaliação inteira (e suas fotos extras, via ON DELETE CASCADE).
    Também apaga a foto obrigatória, pois ela é uma coluna da própria linha."""
    result = await db.execute(delete(Avaliacao).where(Avaliacao.id == avaliacao_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada")
    await db.commit()


@router.delete("/avaliacao-fotos/{foto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_foto_extra(
    foto_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    """Remove só uma foto extra (tabela avaliacao_fotos), mantendo o resto
    da avaliação — útil quando apenas uma foto específica viola as regras."""
    result = await db.execute(delete(AvaliacaoFoto).where(AvaliacaoFoto.id == foto_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto não encontrada")
    await db.commit()
