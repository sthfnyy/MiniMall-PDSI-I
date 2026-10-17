from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import PontosTransacao, Profile, TipoTransacaoPontos
from ..schemas import (
    ConsumerPontosOut,
    ConsumerPontosSaldoLojaOut,
)


router = APIRouter(
    prefix="/consumidor/pontos",
    tags=["consumidor - pontos"],
)


@router.get("", response_model=ConsumerPontosOut)
async def consultar_pontos(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(PontosTransacao)
            .where(PontosTransacao.usuario_id == profile.id)
            .order_by(PontosTransacao.criado_em.desc())
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar os pontos",
        )

    movimentacoes = result.scalars().all()
    saldo_total = 0
    saldos_por_loja: dict = {}

    for movimentacao in movimentacoes:
        quantidade = (
            movimentacao.quantidade
            if movimentacao.tipo == TipoTransacaoPontos.credito
            else -movimentacao.quantidade
        )
        saldo_total += quantidade
        saldos_por_loja[movimentacao.loja_id] = (
            saldos_por_loja.get(movimentacao.loja_id, 0) + quantidade
        )

    return ConsumerPontosOut(
        saldo_total=saldo_total,
        saldos_por_loja=[
            ConsumerPontosSaldoLojaOut(loja_id=loja_id, saldo=saldo)
            for loja_id, saldo in saldos_por_loja.items()
        ],
        historico=movimentacoes,
    )
