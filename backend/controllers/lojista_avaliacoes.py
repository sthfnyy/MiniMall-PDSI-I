import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_lojista_loja
from ..config.database import get_db
from ..models import Avaliacao, AvaliacaoFoto, Loja, Profile
from ..schemas import LojistaAvaliacaoFotoOut, LojistaAvaliacaoOut

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/lojista/avaliacoes",
    tags=["lojista - avaliações"],
)


@router.get("", response_model=list[LojistaAvaliacaoOut])
async def listar_avaliacoes_minha_loja(
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Lista exclusivamente as avaliações recebidas pela loja do lojista autenticado."""
    try:
        query = (
            select(Avaliacao, Profile.nome_completo)
            .outerjoin(Profile, Avaliacao.usuario_id == Profile.id)
            .where(Avaliacao.loja_id == loja.id)
            .order_by(Avaliacao.criado_em.desc())
        )
        result = await db.execute(query)
        rows = result.all()
    except SQLAlchemyError as exc:
        logger.error(f"Erro ao consultar avaliações da loja: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar as avaliações da loja",
        )

    if not rows:
        return []

    avaliacao_ids = [row[0].id for row in rows]

    try:
        fotos_result = await db.execute(
            select(AvaliacaoFoto)
            .where(AvaliacaoFoto.avaliacao_id.in_(avaliacao_ids))
            .order_by(AvaliacaoFoto.criado_em.asc())
        )
        fotos_por_avaliacao: dict[uuid.UUID, list[LojistaAvaliacaoFotoOut]] = {}
        for foto in fotos_result.scalars().all():
            fotos_por_avaliacao.setdefault(foto.avaliacao_id, []).append(
                LojistaAvaliacaoFotoOut(
                    id=foto.id,
                    url=foto.url,
                    criado_em=foto.criado_em,
                )
            )
    except SQLAlchemyError as exc:
        logger.error(f"Erro ao consultar fotos das avaliações: {exc}")
        fotos_por_avaliacao = {}

    saida: list[LojistaAvaliacaoOut] = []
    for avaliacao, nome_completo in rows:
        fotos = fotos_por_avaliacao.get(avaliacao.id, [])
        saida.append(
            LojistaAvaliacaoOut(
                id=avaliacao.id,
                loja_id=avaliacao.loja_id,
                nota=avaliacao.nota,
                comentario=avaliacao.comentario,
                foto_url=avaliacao.foto_url,
                criado_em=avaliacao.criado_em,
                consumidor_nome=nome_completo or "Consumidor",
                fotos=fotos,
            )
        )

    return saida
