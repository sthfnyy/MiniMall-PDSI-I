import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_profile, require_lojista
from ..config.database import get_db
from ..models import Loja, Profile, StatusLoja, UserRole
from ..schemas import LojaCreateIn, LojaDetailOut, LojaUpdateIn

router = APIRouter(prefix="/lojista/loja", tags=["lojista - perfil da loja"])


async def get_lojista_loja(
    profile: Profile = Depends(require_lojista),
    db: AsyncSession = Depends(get_db),
) -> Loja:
    try:
        result = await db.execute(
            select(Loja).where(Loja.lojista_id == profile.id)
        )
        loja = result.scalar_one_or_none()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao consultar a loja",
        )

    if loja is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loja não encontrada para este lojista",
        )
    return loja


@router.get("", response_model=LojaDetailOut)
async def consultar_minha_loja(
    loja: Loja = Depends(get_lojista_loja),
):
    """Consulta os dados cadastrais da loja do lojista autenticado."""
    return loja


@router.post("", response_model=LojaDetailOut, status_code=status.HTTP_201_CREATED)
async def cadastrar_loja(
    payload: LojaCreateIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Cadastra a loja para o usuário autenticado."""
    try:
        result = await db.execute(
            select(Loja).where(Loja.lojista_id == profile.id)
        )
        loja_existente = result.scalar_one_or_none()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao verificar loja existente",
        )

    if loja_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário já possui uma loja cadastrada",
        )

    agora = datetime.now(UTC)
    nova_loja = Loja(
        id=uuid.uuid4(),
        lojista_id=profile.id,
        nome_loja=payload.nome_loja,
        descricao=payload.descricao,
        endereco_logradouro=payload.endereco_logradouro,
        endereco_numero=payload.endereco_numero,
        endereco_bairro=payload.endereco_bairro,
        endereco_cidade=payload.endereco_cidade,
        endereco_uf=payload.endereco_uf,
        endereco_cep=payload.endereco_cep,
        latitude=payload.latitude,
        longitude=payload.longitude,
        horario_funcionamento=payload.horario_funcionamento,
        whatsapp=payload.whatsapp,
        instagram=payload.instagram,
        facebook=payload.facebook,
        logo_url=payload.logo_url,
        status=StatusLoja.pendente,
        motivo_rejeicao=None,
        aprovado_por=None,
        aprovado_em=None,
        criado_em=agora,
        atualizado_em=agora,
    )

    if profile.role != UserRole.lojista and profile.role != UserRole.admin:
        profile.role = UserRole.lojista
        profile.atualizado_em = agora

    db.add(nova_loja)

    try:
        await db.commit()
        await db.refresh(nova_loja)
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível cadastrar a loja",
        )

    return nova_loja


@router.patch("", response_model=LojaDetailOut)
async def atualizar_minha_loja(
    payload: LojaUpdateIn,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Atualiza os dados cadastrais da loja logada."""
    campos_atualizados = payload.model_dump(exclude_unset=True)
    if not campos_atualizados:
        return loja

    for campo, valor in campos_atualizados.items():
        setattr(loja, campo, valor)

    loja.atualizado_em = datetime.now(UTC)

    try:
        await db.commit()
        await db.refresh(loja)
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível atualizar os dados da loja",
        )

    return loja


@router.post("/solicitar-aprovacao", response_model=LojaDetailOut)
async def solicitar_aprovacao_loja(
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Solicita a aprovação da loja pelo administrador (ex: após rejeição)."""
    if loja.status == StatusLoja.aprovada:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A loja já se encontra aprovada",
        )

    if loja.status == StatusLoja.pendente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A solicitação de aprovação já está em análise",
        )

    loja.status = StatusLoja.pendente
    loja.motivo_rejeicao = None
    loja.atualizado_em = datetime.now(UTC)

    try:
        await db.commit()
        await db.refresh(loja)
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível solicitar a aprovação da loja",
        )

    return loja

