import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Visualizacao


router = APIRouter(
    prefix="/visualizacoes",
    tags=["Visualizações"],
)


@router.post("", status_code=status.HTTP_201_CREATED)
async def registrar_visualizacao(
    produto_id: uuid.UUID | None = None,
    loja_id: uuid.UUID | None = None,
    usuario_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    if produto_id is None and loja_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe produto_id ou loja_id",
        )

    visualizacao = Visualizacao(
        id=uuid.uuid4(),
        produto_id=produto_id,
        loja_id=loja_id,
        usuario_id=usuario_id,
        criado_em=datetime.now(timezone.utc),
    )

    db.add(visualizacao)
    await db.commit()

    return {
        "message": "Visualização registrada com sucesso",
        "id": visualizacao.id,
    }