import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import Favorito, Produto, Profile
from ..schemas import FavoritoCreate, FavoritoOut

router = APIRouter(
    prefix="/consumidor/favoritos",
    tags=["consumidor - favoritos"],
)


@router.get("", response_model=list[FavoritoOut])
async def listar_favoritos(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(Favorito, Produto)
            .join(Produto, Produto.id == Favorito.produto_id)
            .where(Favorito.usuario_id == profile.id)
            .order_by(Favorito.criado_em.desc())
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar os favoritos",
        )

    return [
        FavoritoOut(criado_em=favorito.criado_em, produto=produto)
        for favorito, produto in result.all()
    ]


@router.post(
    "",
    response_model=FavoritoOut,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_favorito(
    payload: FavoritoCreate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    produto_result = await db.execute(
        select(Produto).where(Produto.id == payload.produto_id)
    )
    produto = produto_result.scalar_one_or_none()

    if produto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado",
        )

    favorito_result = await db.execute(
        select(Favorito).where(
            Favorito.usuario_id == profile.id,
            Favorito.produto_id == payload.produto_id,
        )
    )
    if favorito_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Produto já está nos favoritos",
        )

    favorito = Favorito(
        usuario_id=profile.id,
        produto_id=payload.produto_id,
        criado_em=datetime.now(UTC),
    )
    db.add(favorito)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Produto já está nos favoritos",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível adicionar o favorito",
        )

    return FavoritoOut(criado_em=favorito.criado_em, produto=produto)


@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_favorito(
    produto_id: uuid.UUID,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    favorito_result = await db.execute(
        select(Favorito).where(
            Favorito.usuario_id == profile.id,
            Favorito.produto_id == produto_id,
        )
    )
    favorito = favorito_result.scalar_one_or_none()

    if favorito is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorito não encontrado",
        )

    try:
        await db.delete(favorito)
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível remover o favorito",
        )
