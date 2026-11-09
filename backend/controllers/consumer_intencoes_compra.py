import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import (
    IntencaoCompra,
    Loja,
    Produto,
    Profile,
    StatusIntencaoCompra,
)
from ..schemas import ConsumerIntencaoCompraCreate, ConsumerIntencaoCompraOut

router = APIRouter(
    prefix="/consumidor/intencoes-compra",
    tags=["consumidor - intenções de compra"],
)


async def gerar_codigo_unico(db: AsyncSession) -> str:
    for _ in range(10):
        codigo = f"MM-{secrets.token_hex(2).upper()}"
        result = await db.execute(
            select(IntencaoCompra.id).where(IntencaoCompra.codigo == codigo)
        )
        if result.scalar_one_or_none() is None:
            return codigo
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Não foi possível gerar o código da intenção",
    )


@router.post(
    "",
    response_model=ConsumerIntencaoCompraOut,
    status_code=status.HTTP_201_CREATED,
)
async def criar_intencao_compra(
    payload: ConsumerIntencaoCompraCreate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    produto_result = await db.execute(
        select(Produto).where(Produto.id == payload.produto_id)
    )
    produto = produto_result.scalar_one_or_none()
    if produto is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    loja_result = await db.execute(select(Loja).where(Loja.id == payload.loja_id))
    if loja_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    if produto.loja_id != payload.loja_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O produto não pertence à loja informada",
        )

    intencao = IntencaoCompra(
        id=uuid.uuid4(),
        consumidor_id=profile.id,
        loja_id=payload.loja_id,
        produto_id=payload.produto_id,
        codigo=await gerar_codigo_unico(db),
        status=StatusIntencaoCompra.contato_realizado,
        criado_em=datetime.now(UTC),
    )
    db.add(intencao)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível reservar um código único para a intenção",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível registrar a intenção de compra",
        )

    return intencao
