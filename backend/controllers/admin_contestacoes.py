import uuid
from datetime import UTC, datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ..auth import require_admin
from ..config.database import get_db
from ..models import (
    ContestacaoCompra,
    ContestacaoCompraEvidencia,
    IntencaoCompra,
    Loja,
    Produto,
    Profile,
    StatusContestacaoCompra,
)
from ..schemas import (
    AdminContestacaoDecisaoIn,
    AdminContestacaoDetalheOut,
    AdminContestacaoEvidenciaOut,
    AdminContestacaoIntencaoOut,
    AdminContestacaoListaOut,
    AdminContestacaoProdutoOut,
    AdminPessoaResumoOut,
)
from ..services.contestation_storage import (
    ContestationStorage,
    ContestationStorageError,
    get_contestation_storage,
)


router = APIRouter(
    prefix="/admin/contestacoes",
    tags=["admin - contestações de compra"],
)

NOME_INDISPONIVEL = "Usuário removido"


def _pessoa(person_id, nome):
    if person_id is None:
        return None
    return AdminPessoaResumoOut(id=person_id, nome=nome or NOME_INDISPONIVEL)


@router.get("", response_model=list[AdminContestacaoListaOut])
async def listar_contestacoes(
    status_filtro: StatusContestacaoCompra | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    consumidor = aliased(Profile)
    query = (
        select(
            ContestacaoCompra.id,
            IntencaoCompra.codigo,
            consumidor.nome_completo,
            Loja.nome_loja,
            Produto.titulo,
            ContestacaoCompra.status,
            ContestacaoCompra.criado_em,
            ContestacaoCompra.decidido_em,
        )
        .join(IntencaoCompra, IntencaoCompra.id == ContestacaoCompra.intencao_id)
        .join(Loja, Loja.id == IntencaoCompra.loja_id)
        .join(Produto, Produto.id == IntencaoCompra.produto_id)
        .outerjoin(consumidor, consumidor.id == ContestacaoCompra.consumidor_id)
    )
    if status_filtro is not None:
        query = query.where(ContestacaoCompra.status == status_filtro)
    if status_filtro == StatusContestacaoCompra.aguardando_analise:
        # Fila FIFO: as contestações mais antigas são analisadas primeiro.
        query = query.order_by(ContestacaoCompra.criado_em.asc())
    else:
        query = query.order_by(ContestacaoCompra.criado_em.desc())

    try:
        result = await db.execute(query)
    except SQLAlchemyError:
        raise HTTPException(status_code=500, detail="Não foi possível consultar as contestações")

    return [
        AdminContestacaoListaOut(
            id=row_id,
            codigo=codigo,
            consumidor_nome=consumidor_nome or NOME_INDISPONIVEL,
            loja_nome=loja_nome,
            produto_nome=produto_nome,
            status=row_status,
            criado_em=criado_em,
            decidido_em=decidido_em,
        )
        for (
            row_id,
            codigo,
            consumidor_nome,
            loja_nome,
            produto_nome,
            row_status,
            criado_em,
            decidido_em,
        ) in result.all()
    ]


async def _carregar_detalhe(contestacao_id: uuid.UUID, db: AsyncSession) -> AdminContestacaoDetalheOut:
    consumidor = aliased(Profile)
    lojista_decisor = aliased(Profile)
    admin_decisor = aliased(Profile)
    try:
        result = await db.execute(
            select(
                ContestacaoCompra,
                IntencaoCompra,
                Produto.titulo,
                Loja.nome_loja,
                consumidor.nome_completo,
                lojista_decisor.nome_completo,
                admin_decisor.nome_completo,
            )
            .join(IntencaoCompra, IntencaoCompra.id == ContestacaoCompra.intencao_id)
            .join(Loja, Loja.id == IntencaoCompra.loja_id)
            .join(Produto, Produto.id == IntencaoCompra.produto_id)
            .outerjoin(consumidor, consumidor.id == ContestacaoCompra.consumidor_id)
            .outerjoin(lojista_decisor, lojista_decisor.id == IntencaoCompra.decidido_por)
            .outerjoin(admin_decisor, admin_decisor.id == ContestacaoCompra.decidido_por)
            .where(ContestacaoCompra.id == contestacao_id)
        )
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Contestação não encontrada")

        evidencias_result = await db.execute(
            select(ContestacaoCompraEvidencia)
            .where(ContestacaoCompraEvidencia.contestacao_id == contestacao_id)
            .order_by(ContestacaoCompraEvidencia.criado_em.asc())
        )
        evidencias = evidencias_result.scalars().all()
    except SQLAlchemyError:
        raise HTTPException(status_code=500, detail="Não foi possível consultar a contestação")

    (
        contestacao,
        intencao,
        produto_titulo,
        loja_nome,
        consumidor_nome,
        lojista_nome,
        admin_nome,
    ) = row

    return AdminContestacaoDetalheOut(
        id=contestacao.id,
        status=contestacao.status,
        motivo=contestacao.motivo,
        criado_em=contestacao.criado_em,
        decidido_em=contestacao.decidido_em,
        decidido_por=_pessoa(contestacao.decidido_por, admin_nome),
        observacao_admin=contestacao.observacao_admin,
        intencao=AdminContestacaoIntencaoOut(
            id=intencao.id,
            codigo=intencao.codigo,
            status=intencao.status,
            criado_em=intencao.criado_em,
            decidido_em=intencao.decidido_em,
            decidido_por=_pessoa(intencao.decidido_por, lojista_nome),
        ),
        produto=AdminContestacaoProdutoOut(id=intencao.produto_id, titulo=produto_titulo),
        loja=AdminPessoaResumoOut(id=intencao.loja_id, nome=loja_nome),
        consumidor=AdminPessoaResumoOut(
            id=contestacao.consumidor_id,
            nome=consumidor_nome or NOME_INDISPONIVEL,
        ),
        evidencias=[AdminContestacaoEvidenciaOut.model_validate(item) for item in evidencias],
    )


@router.get("/{contestacao_id}", response_model=AdminContestacaoDetalheOut)
async def detalhar_contestacao(
    contestacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    return await _carregar_detalhe(contestacao_id, db)


@router.get("/{contestacao_id}/evidencias/{evidencia_id}")
async def baixar_evidencia(
    contestacao_id: uuid.UUID,
    evidencia_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: ContestationStorage = Depends(get_contestation_storage),
    _admin: Profile = Depends(require_admin),
):
    try:
        result = await db.execute(
            select(ContestacaoCompraEvidencia).where(
                ContestacaoCompraEvidencia.id == evidencia_id,
                ContestacaoCompraEvidencia.contestacao_id == contestacao_id,
            )
        )
        evidencia = result.scalar_one_or_none()
    except SQLAlchemyError:
        raise HTTPException(status_code=500, detail="Não foi possível consultar a evidência")
    if evidencia is None:
        raise HTTPException(status_code=404, detail="Evidência não encontrada")

    try:
        content, _storage_type = await storage.download(evidencia.storage_path)
    except ContestationStorageError as error:
        raise HTTPException(status_code=502, detail=str(error))

    filename = quote(evidencia.nome_arquivo or "evidencia", safe="")
    return Response(
        content=content,
        # O MIME registrado foi validado por assinatura no upload (Issue 4).
        media_type=evidencia.tipo_mime,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{filename}",
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch("/{contestacao_id}", response_model=AdminContestacaoDetalheOut)
async def decidir_contestacao(
    contestacao_id: uuid.UUID,
    payload: AdminContestacaoDecisaoIn,
    db: AsyncSession = Depends(get_db),
    admin: Profile = Depends(require_admin),
):
    try:
        result = await db.execute(
            select(ContestacaoCompra)
            .where(ContestacaoCompra.id == contestacao_id)
            .with_for_update()
        )
        contestacao = result.scalar_one_or_none()
        if contestacao is None:
            raise HTTPException(status_code=404, detail="Contestação não encontrada")
        if contestacao.status != StatusContestacaoCompra.aguardando_analise:
            raise HTTPException(status_code=409, detail="Esta contestação já foi decidida")

        contestacao.status = StatusContestacaoCompra(payload.status)
        contestacao.observacao_admin = payload.observacao_admin
        contestacao.decidido_por = admin.id
        contestacao.decidido_em = datetime.now(UTC)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except IntegrityError:
        # Barreira final do banco (trigger/constraints da migration 049).
        await db.rollback()
        raise HTTPException(status_code=409, detail="Esta contestação já foi decidida")
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Não foi possível registrar a decisão")

    return await _carregar_detalhe(contestacao_id, db)
