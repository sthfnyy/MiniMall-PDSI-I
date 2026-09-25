import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, JSON, Numeric, SmallInteger, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    admin = "admin"
    lojista = "lojista"
    consumidor = "consumidor"


class StatusLoja(str, enum.Enum):
    pendente = "pendente"
    aprovada = "aprovada"
    rejeitada = "rejeitada"


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