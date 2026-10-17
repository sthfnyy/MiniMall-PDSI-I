-- A verificação prévia no ambiente atual não encontrou avaliações duplicadas.
-- O predicado mantém livres as transações de outras ações, cujo avaliacao_id é NULL.
create unique index if not exists uq_pontos_transacoes_avaliacao
  on public.pontos_transacoes (avaliacao_id)
  where avaliacao_id is not null;
