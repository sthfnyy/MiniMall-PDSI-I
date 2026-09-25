from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import (
    Avaliacao,
    Favorito,
    Loja,
    Produto,
    Profile,
    StatusLoja,
    UserRole,
    Visualizacao,
)
from ..schemas import DashboardOut, UsuarioOut

router = APIRouter(prefix="/admin", tags=["admin - usuários e dashboard"])


@router.get("/usuarios", response_model=list[UsuarioOut])
async def listar_usuarios(
    role_filtro: UserRole | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    query = select(Profile).order_by(Profile.criado_em.desc())

    if role_filtro is not None:
        query = query.where(Profile.role == role_filtro)

    result = await db.execute(query)

    return result.scalars().all()


@router.get("/dashboard", response_model=DashboardOut)
async def obter_dashboard(
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    async def contar(query) -> int:
        result = await db.execute(query)
        return result.scalar_one()

    total_aprovadas = await contar(
        select(func.count())
        .select_from(Loja)
        .where(Loja.status == StatusLoja.aprovada)
    )

    total_pendentes = await contar(
        select(func.count())
        .select_from(Loja)
        .where(Loja.status == StatusLoja.pendente)
    )

    total_rejeitadas = await contar(
        select(func.count())
        .select_from(Loja)
        .where(Loja.status == StatusLoja.rejeitada)
    )


    total_produtos = await contar(
    select(func.count()).select_from(Produto)
    )


    total_produtos_ativos = await contar(
        select(func.count())
        .select_from(Produto)
        .where(Produto.ativo.is_(True))
    )

    total_usuarios = await contar(
        select(func.count()).select_from(Profile)
    )

    total_consumidores = await contar(
        select(func.count())
        .select_from(Profile)
        .where(Profile.role == UserRole.consumidor)
    )

    total_lojistas = await contar(
        select(func.count())
        .select_from(Profile)
        .where(Profile.role == UserRole.lojista)
    )

    total_avaliacoes = await contar(
        select(func.count()).select_from(Avaliacao)
    )

    total_visualizacoes = await contar(
        select(func.count()).select_from(Visualizacao)
    )

    total_favoritos = await contar(
        select(func.count()).select_from(Favorito)
    )

    return DashboardOut(
        total_lojas_aprovadas=total_aprovadas,
        total_lojas_pendentes=total_pendentes,
        total_lojas_rejeitadas=total_rejeitadas,
        total_produtos=total_produtos,
        total_produtos_ativos=total_produtos_ativos,
        total_usuarios=total_usuarios,
        total_consumidores=total_consumidores,
        total_lojistas=total_lojistas,
        total_avaliacoes=total_avaliacoes,
        total_visualizacoes=total_visualizacoes,
        engajamento_proxy=total_avaliacoes + total_favoritos,
    )