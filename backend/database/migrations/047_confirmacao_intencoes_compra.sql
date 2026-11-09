-- Migration 047: permite ao lojista registrar uma decisão definitiva sobre a compra

alter type public.status_intencao_compra
  add value if not exists 'compra_confirmada';

alter type public.status_intencao_compra
  add value if not exists 'compra_nao_reconhecida';

alter table public.intencoes_compra
  add column if not exists decidido_em timestamptz null,
  add column if not exists decidido_por uuid null references auth.users(id) on delete set null;

create policy "intencoes_compra: leitura pelo lojista"
  on public.intencoes_compra for select
  to authenticated
  using (
    exists (
      select 1
      from public.lojas
      where lojas.id = intencoes_compra.loja_id
        and lojas.lojista_id = auth.uid()
    )
  );

create policy "intencoes_compra: atualização pelo lojista"
  on public.intencoes_compra for update
  to authenticated
  using (
    exists (
      select 1
      from public.lojas
      where lojas.id = intencoes_compra.loja_id
        and lojas.lojista_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.lojas
      where lojas.id = intencoes_compra.loja_id
        and lojas.lojista_id = auth.uid()
    )
  );
