import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import Avaliacao, AvaliacaoFoto, Loja, Profile
from ..schemas import (
    ConsumerAvaliacaoCreate,
    ConsumerAvaliacaoFotoOut,
    ConsumerAvaliacaoOut,
    ConsumerAvaliacaoUpdate,
)
from ..services.review_storage import (
    ReviewStorage,
    ReviewStorageError,
    get_review_storage,
)


logger = logging.getLogger(__name__)
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_PHOTOS_PER_REVIEW = 3
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ("jpg", {".jpg", ".jpeg"}),
    "image/png": ("png", {".png"}),
    "image/webp": ("webp", {".webp"}),
}

router = APIRouter(
    prefix="/consumidor/avaliacoes",
    tags=["consumidor - avaliações"],
)


@router.get("", response_model=list[ConsumerAvaliacaoOut])
async def listar_avaliacoes(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(Avaliacao)
            .where(Avaliacao.usuario_id == profile.id)
            .order_by(Avaliacao.criado_em.desc())
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar as avaliações",
        )

    avaliacoes = result.scalars().all()
    if not avaliacoes:
        return []

    try:
        fotos_result = await db.execute(
            select(AvaliacaoFoto)
            .where(AvaliacaoFoto.avaliacao_id.in_([item.id for item in avaliacoes]))
            .order_by(AvaliacaoFoto.criado_em.asc())
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar as fotos das avaliações",
        )

    fotos_por_avaliacao: dict[uuid.UUID, list[AvaliacaoFoto]] = {}
    for foto in fotos_result.scalars().all():
        fotos_por_avaliacao.setdefault(foto.avaliacao_id, []).append(foto)

    return [
        ConsumerAvaliacaoOut(
            id=avaliacao.id,
            loja_id=avaliacao.loja_id,
            nota=avaliacao.nota,
            comentario=avaliacao.comentario,
            foto_url=avaliacao.foto_url,
            criado_em=avaliacao.criado_em,
            fotos=fotos_por_avaliacao.get(avaliacao.id, []),
        )
        for avaliacao in avaliacoes
    ]


def _detect_image_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _validate_image(file: UploadFile) -> tuple[bytes, str, str]:
    content = await file.read(MAX_FILE_SIZE + 1)
    if not content:
        raise HTTPException(status_code=422, detail="O arquivo de imagem está vazio")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="A foto deve ter no máximo 5 MB")

    declared_type = (file.content_type or "").lower()
    if declared_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Formato de imagem não permitido")

    detected_type = _detect_image_type(content)
    if detected_type is None or detected_type != declared_type:
        raise HTTPException(
            status_code=415,
            detail="O conteúdo do arquivo não corresponde ao formato informado",
        )

    extension, accepted_suffixes = ALLOWED_IMAGE_TYPES[detected_type]
    original_suffix = Path(file.filename or "").suffix.lower()
    if original_suffix not in accepted_suffixes:
        raise HTTPException(status_code=415, detail="Extensão de arquivo inválida")
    return content, detected_type, extension


@router.post(
    "/{avaliacao_id}/fotos",
    response_model=ConsumerAvaliacaoFotoOut,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_foto(
    avaliacao_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
    storage: ReviewStorage = Depends(get_review_storage),
):
    try:
        avaliacao_result = await db.execute(
            select(Avaliacao)
            .where(
                Avaliacao.id == avaliacao_id,
                Avaliacao.usuario_id == profile.id,
            )
            .with_for_update()
        )
        avaliacao = avaliacao_result.scalar_one_or_none()
        if avaliacao is None:
            raise HTTPException(status_code=404, detail="Avaliação não encontrada")

        total_result = await db.execute(
            select(func.count())
            .select_from(AvaliacaoFoto)
            .where(AvaliacaoFoto.avaliacao_id == avaliacao_id)
        )
        if total_result.scalar_one() >= MAX_PHOTOS_PER_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A avaliação já possui o limite de 3 fotos",
            )
    except HTTPException:
        raise
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Não foi possível validar a avaliação")

    try:
        content, content_type, extension = await _validate_image(arquivo)
    except HTTPException:
        await db.rollback()
        raise

    foto_id = uuid.uuid4()
    object_path = f"{profile.id}/{avaliacao_id}/{foto_id}.{extension}"
    try:
        public_url = await storage.upload(object_path, content, content_type)
    except ReviewStorageError as error:
        await db.rollback()
        raise HTTPException(status_code=502, detail=str(error))

    foto = AvaliacaoFoto(
        id=foto_id,
        avaliacao_id=avaliacao_id,
        url=public_url,
        criado_em=datetime.now(UTC),
    )
    db.add(foto)
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        try:
            await storage.remove(object_path)
        except ReviewStorageError:
            logger.exception("Falha ao compensar upload sem registro: %s", object_path)
        raise HTTPException(status_code=500, detail="Não foi possível registrar a foto")
    return foto


@router.delete(
    "/{avaliacao_id}/fotos/{foto_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remover_foto(
    avaliacao_id: uuid.UUID,
    foto_id: uuid.UUID,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
    storage: ReviewStorage = Depends(get_review_storage),
):
    try:
        result = await db.execute(
            select(AvaliacaoFoto)
            .join(Avaliacao, Avaliacao.id == AvaliacaoFoto.avaliacao_id)
            .where(
                Avaliacao.id == avaliacao_id,
                Avaliacao.usuario_id == profile.id,
                AvaliacaoFoto.id == foto_id,
            )
            .with_for_update()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=500, detail="Não foi possível consultar a foto")

    foto = result.scalar_one_or_none()
    if foto is None:
        raise HTTPException(status_code=404, detail="Foto não encontrada")

    try:
        object_path = storage.object_path(foto.url)
        backup_content, backup_content_type = await storage.download(object_path)
        await storage.remove(object_path)
    except ReviewStorageError as error:
        await db.rollback()
        raise HTTPException(status_code=502, detail=str(error))

    try:
        await db.delete(foto)
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        try:
            await storage.upload(object_path, backup_content, backup_content_type)
        except ReviewStorageError:
            logger.exception("Falha ao restaurar foto após rollback: %s", object_path)
        raise HTTPException(status_code=500, detail="Não foi possível remover o registro da foto")


@router.post(
    "",
    response_model=ConsumerAvaliacaoOut,
    status_code=status.HTTP_201_CREATED,
)
async def criar_avaliacao(
    payload: ConsumerAvaliacaoCreate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        loja_result = await db.execute(
            select(Loja).where(Loja.id == payload.loja_id)
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar a loja",
        )

    if loja_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loja não encontrada",
        )

    avaliacao = Avaliacao(
        id=uuid.uuid4(),
        loja_id=payload.loja_id,
        usuario_id=profile.id,
        nota=payload.nota,
        comentario=payload.comentario,
        foto_url="",
        criado_em=datetime.now(UTC),
    )
    db.add(avaliacao)

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível criar a avaliação",
        )

    return avaliacao


@router.patch("/{avaliacao_id}", response_model=ConsumerAvaliacaoOut)
async def atualizar_avaliacao(
    avaliacao_id: uuid.UUID,
    payload: ConsumerAvaliacaoUpdate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Avaliacao).where(
            Avaliacao.id == avaliacao_id,
            Avaliacao.usuario_id == profile.id,
        )
    )
    avaliacao = result.scalar_one_or_none()

    if avaliacao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avaliação não encontrada",
        )

    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(avaliacao, campo, valor)

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível atualizar a avaliação",
        )

    return avaliacao


@router.delete("/{avaliacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_avaliacao(
    avaliacao_id: uuid.UUID,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Avaliacao).where(
            Avaliacao.id == avaliacao_id,
            Avaliacao.usuario_id == profile.id,
        )
    )
    avaliacao = result.scalar_one_or_none()

    if avaliacao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avaliação não encontrada",
        )

    try:
        await db.delete(avaliacao)
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível remover a avaliação",
        )
