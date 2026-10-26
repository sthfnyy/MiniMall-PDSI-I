import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import StatusLoja, TipoTransacaoPontos, UserRole


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


class ConsumerProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: UserRole
    nome_completo: str
    telefone: str | None
    avatar_url: str | None
    criado_em: datetime
    atualizado_em: datetime


class ConsumerProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome_completo: str | None = None
    telefone: str | None = None
    avatar_url: str | None = None

    @field_validator("nome_completo")
    @classmethod
    def validar_nome_completo(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("nome_completo não pode ser vazio")
        return value.strip()


class FavoritoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    produto_id: uuid.UUID


class ProdutoFavoritoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    loja_id: uuid.UUID
    categoria_id: uuid.UUID
    titulo: str
    descricao: str | None
    preco_base: Decimal
    foto_principal_url: str | None
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime


class FavoritoOut(BaseModel):
    criado_em: datetime
    produto: ProdutoFavoritoOut


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


class ConsumerAvaliacaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    loja_id: uuid.UUID
    nota: int = Field(strict=True, ge=1, le=5)
    comentario: str | None = None


class ConsumerAvaliacaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nota: int = Field(default=None, strict=True, ge=1, le=5)
    comentario: str | None = None


class ConsumerAvaliacaoFotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    criado_em: datetime


class ConsumerAvaliacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    loja_id: uuid.UUID
    nota: int
    comentario: str | None
    foto_url: str
    criado_em: datetime
    fotos: list[ConsumerAvaliacaoFotoOut] = Field(default_factory=list)


class ConsumerPontosMovimentacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    loja_id: uuid.UUID
    tipo: TipoTransacaoPontos
    quantidade: int
    avaliacao_id: uuid.UUID | None
    descricao: str | None
    criado_em: datetime


class ConsumerPontosSaldoLojaOut(BaseModel):
    loja_id: uuid.UUID
    saldo: int


class ConsumerPontosOut(BaseModel):
    saldo_total: int
    saldos_por_loja: list[ConsumerPontosSaldoLojaOut]
    historico: list[ConsumerPontosMovimentacaoOut]


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



class LojaDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lojista_id: uuid.UUID
    nome_loja: str
    descricao: str | None = None
    endereco_logradouro: str | None = None
    endereco_numero: str | None = None
    endereco_bairro: str | None = None
    endereco_cidade: str
    endereco_uf: str
    endereco_cep: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    horario_funcionamento: dict | None = None
    whatsapp: str
    instagram: str | None = None
    facebook: str | None = None
    logo_url: str | None = None
    status: StatusLoja
    motivo_rejeicao: str | None = None
    aprovado_por: uuid.UUID | None = None
    aprovado_em: datetime | None = None
    criado_em: datetime
    atualizado_em: datetime


class LojaCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome_loja: str
    descricao: str | None = None
    endereco_logradouro: str | None = None
    endereco_numero: str | None = None
    endereco_bairro: str | None = None
    endereco_cidade: str
    endereco_uf: str = Field(min_length=2, max_length=2)
    endereco_cep: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    horario_funcionamento: dict | None = None
    whatsapp: str
    instagram: str | None = None
    facebook: str | None = None
    logo_url: str | None = None

    @field_validator("nome_loja")
    @classmethod
    def validar_nome_loja(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("nome_loja não pode ser vazio")
        return v.strip()

    @field_validator("whatsapp")
    @classmethod
    def validar_whatsapp(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("whatsapp não pode ser vazio")
        return v.strip()

    @field_validator("endereco_cidade")
    @classmethod
    def validar_cidade(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("endereco_cidade não pode ser vazio")
        return v.strip()

    @field_validator("endereco_uf")
    @classmethod
    def validar_uf(cls, v: str) -> str:
        if not v or len(v.strip()) != 2:
            raise ValueError("endereco_uf deve conter exatamente 2 caracteres")
        return v.strip().upper()


class LojaUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome_loja: str | None = None
    descricao: str | None = None
    endereco_logradouro: str | None = None
    endereco_numero: str | None = None
    endereco_bairro: str | None = None
    endereco_cidade: str | None = None
    endereco_uf: str | None = Field(default=None, min_length=2, max_length=2)
    endereco_cep: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    horario_funcionamento: dict | None = None
    whatsapp: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    logo_url: str | None = None

    @field_validator("nome_loja")
    @classmethod
    def validar_nome_loja(cls, v: str | None) -> str | None:
        if v is not None:
            if not v.strip():
                raise ValueError("nome_loja não pode ser vazio")
            return v.strip()
        return v

    @field_validator("whatsapp")
    @classmethod
    def validar_whatsapp(cls, v: str | None) -> str | None:
        if v is not None:
            if not v.strip():
                raise ValueError("whatsapp não pode ser vazio")
            return v.strip()
        return v

    @field_validator("endereco_cidade")
    @classmethod
    def validar_cidade(cls, v: str | None) -> str | None:
        if v is not None:
            if not v.strip():
                raise ValueError("endereco_cidade não pode ser vazio")
            return v.strip()
        return v

    @field_validator("endereco_uf")
    @classmethod
    def validar_uf(cls, v: str | None) -> str | None:
        if v is not None:
            if len(v.strip()) != 2:
                raise ValueError("endereco_uf deve conter exatamente 2 caracteres")
            return v.strip().upper()
        return v
