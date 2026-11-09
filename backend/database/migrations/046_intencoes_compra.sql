-- Migration 046: registra o contato iniciado pelo consumidor com uma loja

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_intencao_compra') then
    create type public.status_intencao_compra as enum ('contato_realizado');
  end if;
end
$$;

create table if not exists public.intencoes_compra (
  id uuid primary key,
  consumidor_id uuid not null references auth.users(id) on delete restrict,
  loja_id uuid not null references public.lojas(id) on delete restrict,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  codigo text not null unique check (codigo ~ '^MM-[0-9A-F]{4}$'),
  status public.status_intencao_compra not null default 'contato_realizado',
  criado_em timestamptz not null default now()
);

create index if not exists idx_intencoes_compra_consumidor
  on public.intencoes_compra (consumidor_id, criado_em desc);

create index if not exists idx_intencoes_compra_loja
  on public.intencoes_compra (loja_id, criado_em desc);

alter table public.intencoes_compra enable row level security;

create policy "intencoes_compra: inserção pelo consumidor"
  on public.intencoes_compra for insert
  to authenticated
  with check (consumidor_id = auth.uid());

create policy "intencoes_compra: leitura pelo consumidor"
  on public.intencoes_compra for select
  to authenticated
  using (consumidor_id = auth.uid());
