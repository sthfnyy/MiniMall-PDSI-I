import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_lojista_loja
from ..config.database import get_db
from ..models import Categoria, Loja, Produto, ProdutoFoto, VariacaoProduto
from ..schemas import (
    ProdutoFotoOut,
    ProdutoLojistaCreateIn,
    ProdutoLojistaOut,
    ProdutoLojistaUpdateIn,
    VariacaoProdutoOut,
)
from ..services.product_storage import (
    ProductStorage,
    ProductStorageError,
    get_product_storage,
)

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ("jpg", {".jpg", ".jpeg"}),
    "image/png": ("png", {".png"}),
    "image/webp": ("webp", {".webp"}),
}

router = APIRouter(prefix="/lojista/produtos", tags=["lojista - produtos"])


def _detect_image_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _validate_image(file: UploadFile) -> tuple[bytes, str, str]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Arquivo de imagem vazio")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Arquivo excede o tamanho máximo de 5MB",
        )

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


async def _montar_produtos_out(
    produtos: list[Produto],
    db: AsyncSession,
) -> list[ProdutoLojistaOut]:
    if not produtos:
        return []

    produto_ids = [p.id for p in produtos]

    # Carrega categorias
    categoria_ids = list({p.categoria_id for p in produtos})
    cat_result = await db.execute(
        select(Categoria).where(Categoria.id.in_(categoria_ids))
    )
    categorias_map = {c.id: c.nome for c in cat_result.scalars().all()}

    # Carrega fotos
    fotos_result = await db.execute(
        select(ProdutoFoto)
        .where(ProdutoFoto.produto_id.in_(produto_ids))
        .order_by(ProdutoFoto.ordem.asc(), ProdutoFoto.criado_em.asc())
    )
    fotos_map: dict[uuid.UUID, list[ProdutoFotoOut]] = {}
    for f in fotos_result.scalars().all():
        fotos_map.setdefault(f.produto_id, []).append(ProdutoFotoOut.model_validate(f))

    # Carrega variações
    var_result = await db.execute(
        select(VariacaoProduto).where(VariacaoProduto.produto_id.in_(produto_ids))
    )
    var_map: dict[uuid.UUID, list[VariacaoProdutoOut]] = {}
    for v in var_result.scalars().all():
        var_map.setdefault(v.produto_id, []).append(VariacaoProdutoOut.model_validate(v))

    res = []
    for p in produtos:
        out = ProdutoLojistaOut(
            id=p.id,
            loja_id=p.loja_id,
            categoria_id=p.categoria_id,
            categoria_nome=categorias_map.get(p.categoria_id),
            titulo=p.titulo,
            descricao=p.descricao,
            preco_base=p.preco_base,
            preco_promocional=p.preco_promocional,
            foto_principal_url=p.foto_principal_url,
            ativo=p.ativo,
            criado_em=p.criado_em,
            atualizado_em=p.atualizado_em,
            fotos=fotos_map.get(p.id, []),
            variacoes=var_map.get(p.id, []),
        )
        res.append(out)
    return res


@router.get("", response_model=list[ProdutoLojistaOut])
async def listar_produtos_lojista(
    busca: str | None = Query(None, description="Busca por título ou descrição"),
    categoria_id: uuid.UUID | None = Query(None, description="Filtro por categoria"),
    ativo: bool | None = Query(None, description="Filtro por status ativo"),
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos os produtos pertencentes à loja do lojista logado."""
    query = select(Produto).where(Produto.loja_id == loja.id)

    if busca and busca.strip():
        termo = f"%{busca.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Produto.titulo).like(termo),
                func.lower(Produto.descricao).like(termo),
            )
        )

    if categoria_id is not None:
        query = query.where(Produto.categoria_id == categoria_id)

    if ativo is not None:
        query = query.where(Produto.ativo == ativo)

    query = query.order_by(Produto.criado_em.desc())

    try:
        result = await db.execute(query)
        produtos = result.scalars().all()
        return await _montar_produtos_out(produtos, db)
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao consultar os produtos da loja",
        )


@router.post("", response_model=ProdutoLojistaOut, status_code=status.HTTP_201_CREATED)
async def criar_produto_lojista(
    payload: ProdutoLojistaCreateIn,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Cria um novo produto no catálogo da loja logada."""
    # Valida categoria
    cat_result = await db.execute(
        select(Categoria).where(Categoria.id == payload.categoria_id)
    )
    if cat_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Categoria informada não existe",
        )

    agora = datetime.now(UTC)
    novo_produto = Produto(
        id=uuid.uuid4(),
        loja_id=loja.id,
        categoria_id=payload.categoria_id,
        titulo=payload.titulo,
        descricao=payload.descricao,
        preco_base=payload.preco_base,
        preco_promocional=payload.preco_promocional,
        foto_principal_url=payload.foto_principal_url,
        ativo=payload.ativo,
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(novo_produto)

    # Cria variações caso enviadas
    if payload.variacoes:
        for v in payload.variacoes:
            nova_var = VariacaoProduto(
                id=uuid.uuid4(),
                produto_id=novo_produto.id,
                tamanho=v.tamanho,
                cor=v.cor,
                preco=v.preco,
                sku=v.sku,
                ativo=v.ativo,
            )
            db.add(nova_var)

    try:
        await db.commit()
        await db.refresh(novo_produto)
        produtos_out = await _montar_produtos_out([novo_produto], db)
        return produtos_out[0]
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível criar o produto",
        )


@router.get("/{produto_id}", response_model=ProdutoLojistaOut)
async def obter_produto_lojista(
    produto_id: uuid.UUID,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Obtém detalhes de um produto da loja logada."""
    result = await db.execute(
        select(Produto).where(
            Produto.id == produto_id,
            Produto.loja_id == loja.id,
        )
    )
    produto = result.scalar_one_or_none()
    if produto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado no catálogo da sua loja",
        )

    produtos_out = await _montar_produtos_out([produto], db)
    return produtos_out[0]


@router.patch("/{produto_id}", response_model=ProdutoLojistaOut)
async def atualizar_produto_lojista(
    produto_id: uuid.UUID,
    payload: ProdutoLojistaUpdateIn,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Atualiza um produto pertencente à loja logada."""
    result = await db.execute(
        select(Produto)
        .where(
            Produto.id == produto_id,
            Produto.loja_id == loja.id,
        )
        .with_for_update()
    )
    produto = result.scalar_one_or_none()
    if produto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado no catálogo da sua loja",
        )

    # Se categoria alterada, valida se existe
    if payload.categoria_id is not None:
        cat_result = await db.execute(
            select(Categoria).where(Categoria.id == payload.categoria_id)
        )
        if cat_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria informada não existe",
            )
        produto.categoria_id = payload.categoria_id

    # Validação cruzada de preço promocional vs preço base
    dados_atualizacao = payload.model_dump(exclude_unset=True)
    preco_base_novo = (
        payload.preco_base if payload.preco_base is not None else produto.preco_base
    )
    preco_promo_novo = (
        payload.preco_promocional
        if "preco_promocional" in dados_atualizacao
        else produto.preco_promocional
    )

    if preco_promo_novo is not None and preco_promo_novo >= preco_base_novo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O preço promocional deve ser menor que o preço base",
        )

    for campo in ["titulo", "descricao", "preco_base", "preco_promocional", "foto_principal_url", "ativo"]:
        if campo in dados_atualizacao:
            setattr(produto, campo, dados_atualizacao[campo])

    # Se variações foram passadas no payload, substitui as existentes
    if payload.variacoes is not None:
        antigas_result = await db.execute(
            select(VariacaoProduto).where(VariacaoProduto.produto_id == produto.id)
        )
        for antiga in antigas_result.scalars().all():
            await db.delete(antiga)

        for v in payload.variacoes:
            nova_var = VariacaoProduto(
                id=uuid.uuid4(),
                produto_id=produto.id,
                tamanho=v.tamanho,
                cor=v.cor,
                preco=v.preco,
                sku=v.sku,
                ativo=v.ativo,
            )
            db.add(nova_var)

    produto.atualizado_em = datetime.now(UTC)

    try:
        await db.commit()
        await db.refresh(produto)
        produtos_out = await _montar_produtos_out([produto], db)
        return produtos_out[0]
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível atualizar o produto",
        )


@router.delete("/{produto_id}")
async def deletar_produto_lojista(
    produto_id: uuid.UUID,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Exclui um produto do catálogo da loja logada."""
    result = await db.execute(
        select(Produto).where(
            Produto.id == produto_id,
            Produto.loja_id == loja.id,
        )
    )
    produto = result.scalar_one_or_none()
    if produto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado no catálogo da sua loja",
        )

    try:
        await db.delete(produto)
        await db.commit()
        return {"message": "Produto excluído com sucesso", "id": str(produto_id)}
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível excluir o produto",
        )


@router.post(
    "/{produto_id}/fotos",
    response_model=ProdutoFotoOut,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_foto_produto(
    produto_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
):
    """Faz upload de uma nova foto e a vincula ao produto da loja logada."""
    result = await db.execute(
        select(Produto).where(
            Produto.id == produto_id,
            Produto.loja_id == loja.id,
        )
    )
    produto = result.scalar_one_or_none()
    if produto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado no catálogo da sua loja",
        )

    content, content_type, extension = await _validate_image(arquivo)
    foto_id = uuid.uuid4()
    object_path = f"{loja.id}/{produto_id}/{foto_id}.{extension}"

    try:
        public_url = await storage.upload(object_path, content, content_type)
    except ProductStorageError as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha no armazenamento da imagem: {err}",
        )

    # Descobre a próxima ordem
    count_result = await db.execute(
        select(func.count()).select_from(ProdutoFoto).where(ProdutoFoto.produto_id == produto_id)
    )
    ordem_atual = count_result.scalar_one()

    nova_foto = ProdutoFoto(
        id=foto_id,
        produto_id=produto_id,
        url=public_url,
        ordem=ordem_atual,
        criado_em=datetime.now(UTC),
    )
    db.add(nova_foto)

    # Se produto não tinha foto principal, define esta como principal
    if not produto.foto_principal_url:
        produto.foto_principal_url = public_url

    try:
        await db.commit()
        await db.refresh(nova_foto)
        return ProdutoFotoOut.model_validate(nova_foto)
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao salvar registro da foto no banco de dados",
        )


@router.delete("/{produto_id}/fotos/{foto_id}")
async def remover_foto_produto(
    produto_id: uuid.UUID,
    foto_id: uuid.UUID,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
):
    """Remove uma foto específica de um produto da loja logada."""
    result = await db.execute(
        select(Produto).where(
            Produto.id == produto_id,
            Produto.loja_id == loja.id,
        )
    )
    produto = result.scalar_one_or_none()
    if produto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado no catálogo da sua loja",
        )

    foto_result = await db.execute(
        select(ProdutoFoto).where(
            ProdutoFoto.id == foto_id,
            ProdutoFoto.produto_id == produto_id,
        )
    )
    foto = foto_result.scalar_one_or_none()
    if foto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Foto não encontrada para este produto",
        )

    try:
        object_path = storage.object_path(foto.url)
        await storage.remove(object_path)
    except Exception as err:
        logger.warning(f"Aviso ao remover foto do storage: {err}")

    # Se a foto removida for a foto principal, atualiza para outra ou None
    if produto.foto_principal_url == foto.url:
        outra_foto_result = await db.execute(
            select(ProdutoFoto).where(
                ProdutoFoto.produto_id == produto_id,
                ProdutoFoto.id != foto_id,
            ).order_by(ProdutoFoto.ordem.asc())
        )
        outra_foto = outra_foto_result.scalars().first()
        produto.foto_principal_url = outra_foto.url if outra_foto else None

    try:
        await db.delete(foto)
        await db.commit()
        return {"message": "Foto removida com sucesso", "foto_id": str(foto_id)}
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao excluir foto do banco de dados",
        )


@router.post("/upload-foto", status_code=status.HTTP_201_CREATED)
async def upload_foto_avulsa(
    arquivo: UploadFile = File(...),
    loja: Loja = Depends(get_lojista_loja),
    storage: ProductStorage = Depends(get_product_storage),
):
    """Upload de foto avulsa para ser usada no cadastro de produtos."""
    content, content_type, extension = await _validate_image(arquivo)
    foto_id = uuid.uuid4()
    object_path = f"{loja.id}/produtos/{foto_id}.{extension}"

    try:
        public_url = await storage.upload(object_path, content, content_type)
        return {"url": public_url}
    except ProductStorageError as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha no armazenamento da imagem: {err}",
        )

