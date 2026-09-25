from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config.database import async_session
from .controllers import (
    admin_categorias,
    admin_lojas,
    admin_moderacao,
    admin_usuarios,
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

app.include_router(admin_lojas.router)
app.include_router(admin_moderacao.router)
app.include_router(admin_categorias.router)
app.include_router(admin_usuarios.router)
app.include_router(visualizacoes.router)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/db-test")
async def db_test():
    async with async_session() as session:
        result = await session.execute(text("SELECT 1"))
        return {"database": result.scalar()}