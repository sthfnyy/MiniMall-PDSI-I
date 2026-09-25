# Backend do Administrador — MiniMall

## Objetivo

Este diretório contém a implementação do backend necessária para as funcionalidades do Painel do Administrador do MiniMall, utilizando FastAPI, SQLAlchemy e Supabase/PostgreSQL.

## Tecnologias

* Python
* FastAPI
* SQLAlchemy
* PostgreSQL
* Supabase
* Pydantic
* Alembic (estrutura preparada para versionamento de alterações do banco)

## Estrutura

* `main.py` — inicialização da API e registro das rotas.
* `auth.py` — autenticação e autorização das operações administrativas.
* `config/` — configuração da aplicação e conexão com o banco.
* `models/` — modelos das entidades utilizadas pelo SQLAlchemy.
* `controllers/` — endpoints da API.
* `schemas.py` — schemas de entrada e saída da API.
* `schemas/minimall_schema.sql` — estrutura do banco de dados do projeto.

## Banco de dados e Supabase

O projeto utiliza o PostgreSQL disponibilizado pelo Supabase como banco de dados.

O arquivo `schemas/minimall_schema.sql` contém a estrutura necessária para o funcionamento do sistema, incluindo:

* tabelas e tipos enumerados;
* chaves primárias e estrangeiras;
* relacionamentos;
* índices;
* restrições de integridade;
* funções e triggers;
* views;
* Row Level Security (RLS);
* políticas de acesso.

O script deve ser executado em um banco PostgreSQL/Supabase compatível para criar a estrutura inicial do banco.

## SQLAlchemy

O SQLAlchemy é utilizado como camada de acesso ao PostgreSQL. Os modelos Python representam as entidades do banco e as sessões assíncronas são utilizadas pelos controllers para realizar consultas e operações de persistência.

Fluxo simplificado:

Frontend → FastAPI → SQLAlchemy → PostgreSQL/Supabase

## Autenticação e autorização

O backend utiliza a autenticação do Supabase. As rotas administrativas utilizam mecanismos de autorização para permitir operações restritas somente a usuários com perfil de administrador.

Além disso, o banco utiliza Row Level Security (RLS) e políticas de acesso para controlar as operações realizadas diretamente no PostgreSQL/Supabase.

## Funcionalidades administrativas

Foram implementadas operações para:

### Lojas

* listar lojas;
* aprovar lojas;
* rejeitar lojas.

### Moderação

* listar avaliações;
* excluir avaliações;
* excluir fotos de avaliações.

### Categorias

* listar categorias;
* criar categorias;
* editar categorias;
* excluir categorias.

### Usuários

* listar usuários;
* filtrar usuários por perfil.

### Dashboard

O dashboard disponibiliza informações agregadas sobre:

* lojas aprovadas;
* lojas pendentes;
* lojas rejeitadas;
* produtos;
* produtos ativos;
* usuários;
* consumidores;
* lojistas;
* avaliações;
* visualizações;
* engajamento.

### Visualizações

Foi implementado o registro de visualizações de produtos e lojas para permitir a contabilização desse indicador no dashboard.

## Script do banco

O arquivo `schemas/minimall_schema.sql` é o script SQL versionado utilizado para criação/configuração inicial do banco.

Ele funciona como o mecanismo de criação da estrutura inicial do banco nesta etapa do projeto. Alterações futuras na estrutura devem ser mantidas versionadas no repositório, utilizando scripts SQL ou migrations conforme o padrão definido pela equipe.

## Configuração

As credenciais e informações de conexão devem ser fornecidas por variáveis de ambiente. Arquivos `.env` não devem ser versionados no repositório.

A configuração utilizada pelo backend inclui a conexão com o banco de dados e as informações necessárias para autenticação.

## Execução

Com as dependências instaladas e as variáveis de ambiente configuradas, o backend pode ser executado utilizando um servidor ASGI compatível com FastAPI.

Exemplo:

```bash
uvicorn backend.main:app --reload
```

O endpoint `/health` pode ser utilizado para verificar se a API está em execução.

## Observação sobre integração

A API foi validada diretamente no backend e na conexão com o banco. A integração completa com as telas do frontend depende da utilização dos endpoints pela aplicação frontend.
