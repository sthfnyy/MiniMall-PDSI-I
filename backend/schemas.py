import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .models import StatusLoja, UserRole


class LojaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lojista_id: uuid.UUID
    nome_loja: str
    endereco_cidade: str
    endereco_uf: str
    whatsapp: str
    logo_url: str | None
    status: StatusLoja
    motivo_rejeicao: str | None
    criado_em: datetime


class RejeitarLojaIn(BaseModel):
    motivo_rejeicao: str


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: UserRole
    nome_completo: str
    telefone: str | None
    criado_em: datetime


class CategoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str


class CategoriaIn(BaseModel):
    nome: str


class AvaliacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    loja_id: uuid.UUID
    usuario_id: uuid.UUID
    nota: int
    comentario: str | None
    foto_url: str
    criado_em: datetime


class DashboardOut(BaseModel):
    total_lojas_aprovadas: int
    total_lojas_pendentes: int
    total_lojas_rejeitadas: int
    total_produtos: int
    total_produtos_ativos: int
    total_usuarios: int
    total_consumidores: int
    total_lojistas: int
    total_avaliacoes: int
    total_visualizacoes: int
    engajamento_proxy: int
