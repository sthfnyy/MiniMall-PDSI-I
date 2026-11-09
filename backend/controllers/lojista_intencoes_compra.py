import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_lojista_loja, require_lojista
from ..config.database import get_db
from ..models import IntencaoCompra, Loja, Produto, Profile, StatusIntencaoCompra
from ..schemas import (
    LojistaIntencaoCompraDecisaoOut,
    LojistaIntencaoCompraOut,
    LojistaIntencaoCompraUpdate,
    LojistaIntencaoConsumidorOut,
    LojistaIntencaoProdutoOut,
)

router = APIRouter(
    prefix="/lojista/intencoes-compra",
    tags=["lojista - intenções de compra"],
)


@router.get("", response_model=list[LojistaIntencaoCompraOut])
async def listar_intencoes_compra(
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(IntencaoCompra, Produto.titulo, Profile.nome_completo)
            .join(Produto, Produto.id == IntencaoCompra.produto_id)
            .join(Profile, Profile.id == IntencaoCompra.consumidor_id)
            .where(IntencaoCompra.loja_id == loja.id)
            .order_by(IntencaoCompra.criado_em.desc())
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar as intenções de compra",
        )

    return [
        LojistaIntencaoCompraOut(
            id=intencao.id,
            codigo=intencao.codigo,
            produto=LojistaIntencaoProdutoOut(
                id=intencao.produto_id,
                titulo=produto_titulo,
            ),
            consumidor=LojistaIntencaoConsumidorOut(
                id=intencao.consumidor_id,
                nome=consumidor_nome,
            ),
            loja_id=intencao.loja_id,
            status=intencao.status,
            criado_em=intencao.criado_em,
            decidido_em=intencao.decidido_em,
        )
        for intencao, produto_titulo, consumidor_nome in result.all()
    ]


@router.patch(
    "/{intencao_id}",
    response_model=LojistaIntencaoCompraDecisaoOut,
)
async def decidir_intencao_compra(
    intencao_id: uuid.UUID,
    payload: LojistaIntencaoCompraUpdate,
    profile: Profile = Depends(require_lojista),
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(IntencaoCompra)
            .where(
                IntencaoCompra.id == intencao_id,
                IntencaoCompra.loja_id == loja.id,
            )
            .with_for_update()
        )
        intencao = result.scalar_one_or_none()
        if intencao is None:
            raise HTTPException(status_code=404, detail="Intenção não encontrada")
        if intencao.status != StatusIntencaoCompra.contato_realizado:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Esta intenção já possui uma decisão definitiva",
            )

        intencao.status = StatusIntencaoCompra(payload.status)
        intencao.decidido_em = datetime.now(UTC)
        intencao.decidido_por = profile.id
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível registrar a decisão",
        )

    return intencao
