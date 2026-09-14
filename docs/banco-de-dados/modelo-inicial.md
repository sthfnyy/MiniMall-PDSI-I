# Modelo Inicial do Banco de Dados - MiniMall

## Objetivo

Modelar a estrutura inicial do banco de dados do MiniMall,
com base no diagrama de classes e nos requisitos definidos
para o sistema.

## Estrutura

O modelo relacional é composto pelas seguintes entidades:

- Usuário
- Loja
- Produto
- Categoria
- Avaliação
- FotoProduto
- VariacaoProduto
- FotoAvaliacao
- Favorito
- Notificacao
- SaldoPontos
- MovimentacaoPontos
- Moderacao

## Chaves

Cada entidade possui uma chave primária (PK).

As chaves estrangeiras (FK) representam os relacionamentos
entre as entidades.

## Principais relacionamentos

- Usuário → Loja: 1:1
- Loja → Produto: 1:N
- Categoria → Produto: 1:N
- Usuário → Avaliação: 1:N
- Loja → Avaliação: 1:N
- Produto → Favorito: 1:N
- Usuário → Favorito: 1:N
- Usuário → Notificação: 1:N
- Produto → Notificação: 1:N
- Usuário → SaldoPontos: 1:N
- Loja → SaldoPontos: 1:N
- SaldoPontos → MovimentacaoPontos: 1:N
- Avaliação → MovimentacaoPontos: 1:N
- Avaliação → FotoAvaliacao: 1:N
- Produto → FotoProduto: 1:N
- Produto → VariacaoProduto: 1:N
- Avaliação → Moderação: 1:0..1
- Usuário → Moderação: 1:N

## Integridade

- As chaves estrangeiras devem referenciar registros existentes.
- As entidades devem possuir identificadores únicos.
- O relacionamento entre usuário e favorito utiliza chave composta.
- A moderação referencia uma avaliação e o usuário responsável pela ação.
- O campo `perfil` de Usuário diferencia os tipos de usuário,
  incluindo o perfil administrador.

## Validação

O modelo foi elaborado a partir do diagrama de classes existente
e validado considerando os requisitos funcionais definidos para
o sistema.

O DER representa as entidades, atributos, chaves, relacionamentos
e cardinalidades necessárias para a estrutura inicial do banco.