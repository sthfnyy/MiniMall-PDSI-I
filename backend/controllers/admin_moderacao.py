import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import Avaliacao, AvaliacaoFoto, Profile, RegistroModeracao
from ..schemas import AvaliacaoOut, RegistroModeracaoOut

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

@router.get("/historico", response_model=list[RegistroModeracaoOut])
async def listar_historico_moderacao(
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    query = select(RegistroModeracao).order_by(
        RegistroModeracao.criado_em.desc()
    )

    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/avaliacoes/{avaliacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_avaliacao(
    avaliacao_id: uuid.UUID,
    motivo: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    admin: Profile = Depends(require_admin),
):
    if len(motivo.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O motivo deve ter pelo menos 3 caracteres.",
        )

    result = await db.execute(
        select(Avaliacao).where(Avaliacao.id == avaliacao_id)
    )
    avaliacao = result.scalar_one_or_none()

    if avaliacao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avaliação não encontrada",
        )

    registro = RegistroModeracao(
        id=uuid.uuid4(),
        administrador_id=admin.id,
        avaliacao_id=avaliacao.id,
        motivo=motivo.strip(),
        criado_em=datetime.now(timezone.utc),
    )

    try:
        db.add(registro)
        await db.delete(avaliacao)
        await db.commit()
    except Exception:
        await db.rollback()
        raise


@router.delete("/avaliacao-fotos/{foto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_foto_extra(
    foto_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    
    result = await db.execute(delete(AvaliacaoFoto).where(AvaliacaoFoto.id == foto_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto não encontrada")
    await db.commit()
