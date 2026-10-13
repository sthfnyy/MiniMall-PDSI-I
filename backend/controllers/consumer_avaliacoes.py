import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import Avaliacao, Loja, Profile
from ..schemas import (
    ConsumerAvaliacaoCreate,
    ConsumerAvaliacaoOut,
    ConsumerAvaliacaoUpdate,
)

router = APIRouter(
    prefix="/consumidor/avaliacoes",
    tags=["consumidor - avaliações"],
)


@router.get("", response_model=list[ConsumerAvaliacaoOut])
async def listar_avaliacoes(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(Avaliacao)
            .where(Avaliacao.usuario_id == profile.id)
            .order_by(Avaliacao.criado_em.desc())
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar as avaliações",
        )

    return result.scalars().all()


@router.post(
    "",
    response_model=ConsumerAvaliacaoOut,
    status_code=status.HTTP_201_CREATED,
)
async def criar_avaliacao(
    payload: ConsumerAvaliacaoCreate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        loja_result = await db.execute(
            select(Loja).where(Loja.id == payload.loja_id)
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar a loja",
        )

    if loja_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loja não encontrada",
        )

    avaliacao = Avaliacao(
        id=uuid.uuid4(),
        loja_id=payload.loja_id,
        usuario_id=profile.id,
        nota=payload.nota,
        comentario=payload.comentario,
        foto_url="",
        criado_em=datetime.now(UTC),
    )
    db.add(avaliacao)

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível criar a avaliação",
        )

    return avaliacao


@router.patch("/{avaliacao_id}", response_model=ConsumerAvaliacaoOut)
async def atualizar_avaliacao(
    avaliacao_id: uuid.UUID,
    payload: ConsumerAvaliacaoUpdate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Avaliacao).where(
            Avaliacao.id == avaliacao_id,
            Avaliacao.usuario_id == profile.id,
        )
    )
    avaliacao = result.scalar_one_or_none()

    if avaliacao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avaliação não encontrada",
        )

    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(avaliacao, campo, valor)

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível atualizar a avaliação",
        )

    return avaliacao


@router.delete("/{avaliacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_avaliacao(
    avaliacao_id: uuid.UUID,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Avaliacao).where(
            Avaliacao.id == avaliacao_id,
            Avaliacao.usuario_id == profile.id,
        )
    )
    avaliacao = result.scalar_one_or_none()

    if avaliacao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avaliação não encontrada",
        )

    try:
        await db.delete(avaliacao)
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível remover a avaliação",
        )
