import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import Categoria, Profile
from ..schemas import CategoriaIn, CategoriaOut

router = APIRouter(prefix="/admin/categorias", tags=["admin - categorias"])


@router.get("", response_model=list[CategoriaOut])
async def listar_categorias(
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    result = await db.execute(select(Categoria).order_by(Categoria.nome))
    return result.scalars().all()


@router.post("", response_model=CategoriaOut, status_code=status.HTTP_201_CREATED)
async def criar_categoria(
    payload: CategoriaIn,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    categoria = Categoria(id=uuid.uuid4(), nome=payload.nome, criado_em=datetime.now(UTC))
    db.add(categoria)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma categoria com esse nome")
    await db.refresh(categoria)
    return categoria


@router.put("/{categoria_id}", response_model=CategoriaOut)
async def editar_categoria(
    categoria_id: uuid.UUID,
    payload: CategoriaIn,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    result = await db.execute(select(Categoria).where(Categoria.id == categoria_id))
    categoria = result.scalar_one_or_none()
    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada")
    categoria.nome = payload.nome
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma categoria com esse nome")
    await db.refresh(categoria)
    return categoria


@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_categoria(
    categoria_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    result = await db.execute(select(Categoria).where(Categoria.id == categoria_id))
    categoria = result.scalar_one_or_none()
    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada")
    try:
        await db.delete(categoria)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível excluir: existem produtos cadastrados nesta categoria",
        )
