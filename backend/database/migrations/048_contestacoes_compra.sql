-- Migration 048: contestação de compra pelo consumidor e evidências privadas

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_contestacao_compra') then
    create type public.status_contestacao_compra as enum (
      'aguardando_analise',
      'aprovada',
      'reprovada'
    );
  end if;
end
$$;

create table if not exists public.contestacoes_compra (
  id uuid primary key,
  intencao_id uuid not null unique references public.intencoes_compra(id) on delete restrict,
  consumidor_id uuid not null references auth.users(id) on delete restrict,
  motivo text not null check (char_length(btrim(motivo)) between 10 and 2000),
  status public.status_contestacao_compra not null default 'aguardando_analise',
  criado_em timestamptz not null default now()
);

create table if not exists public.contestacao_compra_evidencias (
  id uuid primary key,
  contestacao_id uuid not null references public.contestacoes_compra(id) on delete cascade,
  storage_path text not null unique,
  nome_arquivo text not null,
  tipo_mime text not null,
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  criado_em timestamptz not null default now()
);

create index if not exists idx_contestacoes_compra_consumidor
  on public.contestacoes_compra (consumidor_id, criado_em desc);

create index if not exists idx_contestacao_evidencias_contestacao
  on public.contestacao_compra_evidencias (contestacao_id, criado_em);

alter table public.contestacoes_compra enable row level security;
alter table public.contestacao_compra_evidencias enable row level security;

create policy "contestacoes_compra: leitura pelo consumidor"
  on public.contestacoes_compra for select
  to authenticated
  using (
    consumidor_id = auth.uid()
    and exists (
      select 1 from public.intencoes_compra
      where intencoes_compra.id = contestacoes_compra.intencao_id
        and intencoes_compra.consumidor_id = auth.uid()
    )
  );

create policy "contestacoes_compra: inserção pelo consumidor"
  on public.contestacoes_compra for insert
  to authenticated
  with check (
    consumidor_id = auth.uid()
    and status = 'aguardando_analise'
    and exists (
      select 1 from public.intencoes_compra
      where intencoes_compra.id = contestacoes_compra.intencao_id
        and intencoes_compra.consumidor_id = auth.uid()
        and intencoes_compra.status = 'compra_nao_reconhecida'
    )
  );

create policy "contestacao_evidencias: leitura pelo consumidor"
  on public.contestacao_compra_evidencias for select
  to authenticated
  using (
    exists (
      select 1 from public.contestacoes_compra
      where contestacoes_compra.id = contestacao_compra_evidencias.contestacao_id
        and contestacoes_compra.consumidor_id = auth.uid()
    )
  );

create policy "contestacao_evidencias: inserção pelo consumidor"
  on public.contestacao_compra_evidencias for insert
  to authenticated
  with check (
    exists (
      select 1 from public.contestacoes_compra
      where contestacoes_compra.id = contestacao_compra_evidencias.contestacao_id
        and contestacoes_compra.consumidor_id = auth.uid()
        and contestacoes_compra.status = 'aguardando_analise'
    )
  );

insert into storage.buckets (id, name, public)
values ('evidencias-contestacoes', 'evidencias-contestacoes', false)
on conflict (id) do nothing;

create policy "evidencias_contestacoes: inserção pelo consumidor"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidencias-contestacoes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "evidencias_contestacoes: leitura pelo consumidor"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidencias-contestacoes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
