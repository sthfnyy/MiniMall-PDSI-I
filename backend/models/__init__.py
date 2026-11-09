import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    Integer,
    Numeric,
    SmallInteger,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass

Table(
    "users",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    schema="auth",
)

class UserRole(str, enum.Enum):
    admin = "admin"
    lojista = "lojista"
    consumidor = "consumidor"


class StatusLoja(str, enum.Enum):
    pendente = "pendente"
    aprovada = "aprovada"
    rejeitada = "rejeitada"


class TipoTransacaoPontos(str, enum.Enum):
    credito = "credito"
    resgate = "resgate"


class StatusIntencaoCompra(str, enum.Enum):
    contato_realizado = "contato_realizado"
    compra_confirmada = "compra_confirmada"
    compra_nao_reconhecida = "compra_nao_reconhecida"


class StatusContestacaoCompra(str, enum.Enum):
    aguardando_analise = "aguardando_analise"
    aprovada = "aprovada"
    reprovada = "reprovada"


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", schema="public"),
        default=UserRole.consumidor,
        nullable=False,
    )
    nome_completo: Mapped[str] = mapped_column(Text, nullable=False)
    telefone: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class Loja(Base):
    __tablename__ = "lojas"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    lojista_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    nome_loja: Mapped[str] = mapped_column(Text, nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    endereco_logradouro: Mapped[str | None] = mapped_column(Text)
    endereco_numero: Mapped[str | None] = mapped_column(Text)
    endereco_bairro: Mapped[str | None] = mapped_column(Text)
    endereco_cidade: Mapped[str] = mapped_column(Text, nullable=False)
    endereco_uf: Mapped[str] = mapped_column(Text, nullable=False)
    endereco_cep: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    horario_funcionamento: Mapped[dict | None] = mapped_column(JSON)
    whatsapp: Mapped[str] = mapped_column(Text, nullable=False)
    instagram: Mapped[str | None] = mapped_column(Text)
    facebook: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[StatusLoja] = mapped_column(
        Enum(StatusLoja, name="status_loja", schema="public"),
        default=StatusLoja.pendente,
        nullable=False,
    )
    motivo_rejeicao: Mapped[str | None] = mapped_column(Text)
    aprovado_por: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="SET NULL")
    )
    aprovado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class Categoria(Base):
    __tablename__ = "categorias"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class Produto(Base):
    __tablename__ = "produtos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    loja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lojas.id", ondelete="CASCADE"),
        nullable=False,
    )
    categoria_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categorias.id", ondelete="RESTRICT"),
        nullable=False,
    )
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    preco_base: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    preco_promocional: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    foto_principal_url: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class Favorito(Base):
    __tablename__ = "favoritos"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    produto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("produtos.id", ondelete="CASCADE"),
        primary_key=True,
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class IntencaoCompra(Base):
    __tablename__ = "intencoes_compra"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    consumidor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    loja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lojas.id", ondelete="RESTRICT"),
        nullable=False,
    )
    produto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("produtos.id", ondelete="RESTRICT"),
        nullable=False,
    )
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    status: Mapped[StatusIntencaoCompra] = mapped_column(
        Enum(
            StatusIntencaoCompra,
            name="status_intencao_compra",
            schema="public",
        ),
        default=StatusIntencaoCompra.contato_realizado,
        nullable=False,
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decidido_por: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="SET NULL")
    )


class ContestacaoCompra(Base):
    __tablename__ = "contestacoes_compra"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    intencao_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("intencoes_compra.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    consumidor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[StatusContestacaoCompra] = mapped_column(
        Enum(StatusContestacaoCompra, name="status_contestacao_compra", schema="public"),
        default=StatusContestacaoCompra.aguardando_analise,
        nullable=False,
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decidido_por: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="SET NULL")
    )
    observacao_admin: Mapped[str | None] = mapped_column(Text)


class ContestacaoCompraEvidencia(Base):
    __tablename__ = "contestacao_compra_evidencias"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    contestacao_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contestacoes_compra.id", ondelete="CASCADE"),
        nullable=False,
    )
    storage_path: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nome_arquivo: Mapped[str] = mapped_column(Text, nullable=False)
    tipo_mime: Mapped[str] = mapped_column(Text, nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Avaliacao(Base):
    __tablename__ = "avaliacoes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    loja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lojas.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
    )
    nota: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )
    comentario: Mapped[str | None] = mapped_column(Text)
    foto_url: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class AvaliacaoFoto(Base):
    __tablename__ = "avaliacao_fotos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    avaliacao_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("avaliacoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class PontosTransacao(Base):
    __tablename__ = "pontos_transacoes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
    )
    loja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lojas.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[TipoTransacaoPontos] = mapped_column(
        Enum(
            TipoTransacaoPontos,
            name="tipo_transacao_pontos",
            schema="public",
        ),
        nullable=False,
    )
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)
    avaliacao_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("avaliacoes.id", ondelete="SET NULL"),
        nullable=True,
    )
    descricao: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class Visualizacao(Base):
    __tablename__ = "visualizacoes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)

    produto_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("produtos.id", ondelete="CASCADE"),
        nullable=True,
    )

    loja_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lojas.id", ondelete="CASCADE"),
        nullable=True,
    )

    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="SET NULL"),
        nullable=True,
    )

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class ProdutoFoto(Base):
    __tablename__ = "produto_fotos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    produto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("produtos.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    ordem: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class VariacaoProduto(Base):
    __tablename__ = "variacoes_produto"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    produto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("produtos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tamanho: Mapped[str | None] = mapped_column(Text)
    cor: Mapped[str | None] = mapped_column(Text)
    preco: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    sku: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
