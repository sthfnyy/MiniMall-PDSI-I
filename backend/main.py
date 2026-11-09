from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .config.database import async_session, get_db
from .models import Categoria
from .schemas import CategoriaOut
from .controllers import (
    auth_profile,
    admin_categorias,
    admin_contestacoes,
    admin_lojas,
    admin_moderacao,
    admin_usuarios,
    consumer_avaliacoes,
    consumer_catalogo,
    consumer_favoritos,
    consumer_intencoes_compra,
    consumer_contestacoes,
    consumer_perfil,
    consumer_pontos,
    lojista_loja,
    lojista_produtos,
    lojista_avaliacoes,
    lojista_intencoes_compra,
    visualizacoes,
)

app = FastAPI(title="MiniMall API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_profile.router)
app.include_router(admin_lojas.router)
app.include_router(admin_moderacao.router)
app.include_router(admin_categorias.router)
app.include_router(admin_usuarios.router)
app.include_router(admin_contestacoes.router)
app.include_router(consumer_avaliacoes.router)
app.include_router(consumer_catalogo.router)
app.include_router(consumer_favoritos.router)
app.include_router(consumer_intencoes_compra.router)
app.include_router(consumer_contestacoes.router)
app.include_router(consumer_perfil.router)
app.include_router(consumer_pontos.router)
app.include_router(lojista_loja.router)
app.include_router(lojista_produtos.router)
app.include_router(lojista_avaliacoes.router)
app.include_router(lojista_intencoes_compra.router)
app.include_router(visualizacoes.router)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/categorias", response_model=list[CategoriaOut], tags=["categorias"])
async def listar_categorias(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Categoria).order_by(Categoria.nome))
    return result.scalars().all()


@app.get("/db-test")
async def db_test():
    async with async_session() as session:
        result = await session.execute(text("SELECT 1"))
        return {"database": result.scalar()}
