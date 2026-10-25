
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user_id, security
from ..config.database import get_db
from ..models import Loja, Produto, StatusLoja, Visualizacao


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/visualizacoes",
    tags=["Visualizações"],
)


async def get_optional_user_id(
    authorization: str | None = Header(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> uuid.UUID | None:
    if authorization is None:
        return None

    return await get_current_user_id(credentials)


@router.post("", status_code=status.HTTP_201_CREATED)
async def registrar_visualizacao(
    produto_id: uuid.UUID | None = None,
    loja_id: uuid.UUID | None = None,
    usuario_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    usuario_autenticado: uuid.UUID | None = Depends(get_optional_user_id),
):
    if produto_id is None and loja_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe produto_id ou loja_id",
        )

    
    if usuario_id is not None and usuario_id != usuario_autenticado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="usuario_id não corresponde ao usuário autenticado",
        )

    try:
        loja_consultada = loja_id

        if produto_id is not None:
            resultado = await db.execute(
                select(Produto).where(Produto.id == produto_id)
            )
            produto = resultado.scalar_one_or_none()

            if produto is None or not produto.ativo:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Produto não encontrado ou indisponível",
                )

            if loja_id is not None and loja_id != produto.loja_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Produto não pertence à loja informada",
                )

            loja_consultada = produto.loja_id

        resultado = await db.execute(
            select(Loja).where(
                Loja.id == loja_consultada,
                Loja.status == StatusLoja.aprovada,
            )
        )

        if resultado.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loja não encontrada ou indisponível",
            )

        visualizacao = Visualizacao(
            id=uuid.uuid4(),
            produto_id=produto_id,
            loja_id=loja_id,
            usuario_id=usuario_autenticado,
            criado_em=datetime.now(timezone.utc),
        )

        db.add(visualizacao)
        await db.commit()

        return {
            "message": "Visualização registrada com sucesso",
            "id": visualizacao.id,
        }

    except HTTPException:
        raise

    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Erro ao registrar visualização")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível registrar a visualização",
        )
