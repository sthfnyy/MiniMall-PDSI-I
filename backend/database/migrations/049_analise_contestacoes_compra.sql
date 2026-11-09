-- Migration 049: análise administrativa definitiva das contestações de compra

alter table public.contestacoes_compra
  add column if not exists decidido_em timestamptz null,
  add column if not exists decidido_por uuid null references auth.users(id) on delete set null,
  add column if not exists observacao_admin text null;

alter table public.contestacoes_compra
  add constraint contestacoes_compra_observacao_admin_check
  check (
    observacao_admin is null
    or char_length(btrim(observacao_admin)) between 3 and 1000
  );

-- Pendente não possui auditoria; decidida sempre possui data da decisão.
-- decidido_por é exigido no momento da decisão pelo trigger abaixo, pois a FK
-- "on delete set null" precisa continuar funcionando se o admin for removido.
alter table public.contestacoes_compra
  add constraint contestacoes_compra_decisao_coerente_check
  check (
    (
      status = 'aguardando_analise'
      and decidido_em is null
      and decidido_por is null
      and observacao_admin is null
    )
    or (
      status <> 'aguardando_analise'
      and decidido_em is not null
    )
  );

alter table public.contestacoes_compra
  add constraint contestacoes_compra_reprovacao_observacao_check
  check (status <> 'reprovada' or observacao_admin is not null);

create index if not exists idx_contestacoes_compra_status_criado
  on public.contestacoes_compra (status, criado_em);

create or replace function public.proteger_decisao_contestacao_compra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'aguardando_analise' then
    if new.status is distinct from old.status
      or new.decidido_em is distinct from old.decidido_em
      or new.observacao_admin is distinct from old.observacao_admin
      or (
        new.decidido_por is distinct from old.decidido_por
        and new.decidido_por is not null
      )
    then
      raise exception 'A decisão administrativa desta contestação é definitiva'
        using errcode = 'check_violation';
    end if;
  elsif new.status <> 'aguardando_analise' and new.decidido_por is null then
    raise exception 'A decisão administrativa exige o administrador responsável'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_decisao_contestacao_compra
  on public.contestacoes_compra;

create trigger trg_proteger_decisao_contestacao_compra
  before insert or update on public.contestacoes_compra
  for each row
  execute function public.proteger_decisao_contestacao_compra();
