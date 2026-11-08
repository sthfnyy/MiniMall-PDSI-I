from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import Categoria, Loja, Produto, Profile, StatusLoja
from ..schemas import ConsumerCatalogoOut

router = APIRouter(
    prefix="/consumidor/catalogo",
    tags=["consumidor - catálogo"],
)


@router.get("", response_model=ConsumerCatalogoOut)
async def consultar_catalogo(
    db: AsyncSession = Depends(get_db),
    _consumer: Profile = Depends(require_consumer),
):
    lojas_result = await db.execute(
        select(Loja)
        .where(Loja.status == StatusLoja.aprovada)
        .order_by(Loja.nome_loja)
    )

    produtos_result = await db.execute(
        select(Produto)
        .join(Loja, Loja.id == Produto.loja_id)
        .where(
            Loja.status == StatusLoja.aprovada,
            Produto.ativo.is_(True),
        )
        .order_by(Produto.titulo)
    )

    categorias_result = await db.execute(
        select(Categoria)
        .join(Produto, Produto.categoria_id == Categoria.id)
        .join(Loja, Loja.id == Produto.loja_id)
        .where(
            Loja.status == StatusLoja.aprovada,
            Produto.ativo.is_(True),
        )
        .distinct()
        .order_by(Categoria.nome)
    )

    return ConsumerCatalogoOut(
        lojas=lojas_result.scalars().all(),
        produtos=produtos_result.scalars().all(),
        categorias=categorias_result.scalars().all(),
    )
