import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import (
    ContestacaoCompra,
    ContestacaoCompraEvidencia,
    IntencaoCompra,
    Profile,
    StatusContestacaoCompra,
    StatusIntencaoCompra,
)
from ..schemas import ConsumerContestacaoEvidenciaOut, ConsumerContestacaoOut
from ..services.contestation_storage import (
    ContestationStorage,
    ContestationStorageError,
    get_contestation_storage,
)
from .consumer_avaliacoes import MAX_PHOTOS_PER_REVIEW, _validate_image


logger = logging.getLogger(__name__)
router = APIRouter(tags=["consumidor - contestações de compra"])


async def _remove_uploaded(storage, paths):
    for path in paths:
        try:
            await storage.remove(path)
        except ContestationStorageError:
            logger.exception("Falha ao compensar evidência sem registro: %s", path)


@router.post(
    "/consumidor/intencoes-compra/{intencao_id}/contestacao",
    response_model=ConsumerContestacaoOut,
    status_code=status.HTTP_201_CREATED,
)
async def criar_contestacao(
    intencao_id: uuid.UUID,
    motivo: str = Form(...),
    arquivos: list[UploadFile] | None = File(default=None),
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
    storage: ContestationStorage = Depends(get_contestation_storage),
):
    motivo_normalizado = motivo.strip()
    if not 10 <= len(motivo_normalizado) <= 2000:
        raise HTTPException(
            status_code=422,
            detail="O motivo deve ter entre 10 e 2000 caracteres",
        )

    files = arquivos or []
    if len(files) > MAX_PHOTOS_PER_REVIEW:
        raise HTTPException(status_code=409, detail="Envie no máximo 3 evidências")

    try:
        result = await db.execute(
            select(IntencaoCompra)
            .where(
                IntencaoCompra.id == intencao_id,
                IntencaoCompra.consumidor_id == profile.id,
            )
            .with_for_update()
        )
        intencao = result.scalar_one_or_none()
        if intencao is None:
            raise HTTPException(status_code=404, detail="Intenção não encontrada")
        if intencao.status != StatusIntencaoCompra.compra_nao_reconhecida:
            raise HTTPException(
                status_code=409,
                detail="Somente compras não reconhecidas podem ser contestadas",
            )
        existing = await db.execute(
            select(ContestacaoCompra.id).where(
                ContestacaoCompra.intencao_id == intencao_id
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Esta compra já foi contestada")
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Não foi possível validar a intenção")

    validated_files = []
    try:
        for file in files:
            content, content_type, extension = await _validate_image(file)
            validated_files.append((file, content, content_type, extension))
    except HTTPException:
        await db.rollback()
        raise

    now = datetime.now(UTC)
    contestacao = ContestacaoCompra(
        id=uuid.uuid4(),
        intencao_id=intencao.id,
        consumidor_id=profile.id,
        motivo=motivo_normalizado,
        status=StatusContestacaoCompra.aguardando_analise,
        criado_em=now,
    )
    evidencias = []
    uploaded_paths = []
    try:
        for file, content, content_type, extension in validated_files:
            evidence_id = uuid.uuid4()
            object_path = f"{profile.id}/{contestacao.id}/{evidence_id}.{extension}"
            await storage.upload(object_path, content, content_type)
            uploaded_paths.append(object_path)
            evidencias.append(
                ContestacaoCompraEvidencia(
                    id=evidence_id,
                    contestacao_id=contestacao.id,
                    storage_path=object_path,
                    nome_arquivo=Path(file.filename or f"evidencia.{extension}").name,
                    tipo_mime=content_type,
                    tamanho_bytes=len(content),
                    criado_em=now,
                )
            )

        db.add(contestacao)
        for evidencia in evidencias:
            db.add(evidencia)
        await db.commit()
    except ContestationStorageError as error:
        await db.rollback()
        await _remove_uploaded(storage, uploaded_paths)
        raise HTTPException(status_code=502, detail=str(error))
    except IntegrityError:
        await db.rollback()
        await _remove_uploaded(storage, uploaded_paths)
        raise HTTPException(status_code=409, detail="Esta compra já foi contestada")
    except SQLAlchemyError:
        await db.rollback()
        await _remove_uploaded(storage, uploaded_paths)
        raise HTTPException(status_code=500, detail="Não foi possível registrar a contestação")

    return ConsumerContestacaoOut(
        id=contestacao.id,
        intencao_id=contestacao.intencao_id,
        motivo=contestacao.motivo,
        status=contestacao.status,
        criado_em=contestacao.criado_em,
        evidencias=[ConsumerContestacaoEvidenciaOut.model_validate(item) for item in evidencias],
    )
