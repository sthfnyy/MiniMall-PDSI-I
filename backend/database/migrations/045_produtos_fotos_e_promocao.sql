-- Migration 045: Adiciona preco_promocional em produtos e configura storage para fotos-produtos

alter table public.produtos
  add column if not exists preco_promocional numeric(10,2) check (preco_promocional is null or (preco_promocional >= 0 and preco_promocional < preco_base));

-- Bucket para fotos de produtos
insert into storage.buckets (id, name, public)
values ('fotos-produtos', 'fotos-produtos', true)
on conflict (id) do nothing;

create policy "fotos_produtos: leitura pública"
  on storage.objects for select
  using (bucket_id = 'fotos-produtos');

create policy "fotos_produtos: inserção pelo lojista dono"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fotos-produtos'
    and exists (
      select 1
      from public.lojas
      where lojas.id::text = (storage.foldername(name))[1]
        and lojas.lojista_id = auth.uid()
    )
  );

create policy "fotos_produtos: exclusão pelo lojista dono"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'fotos-produtos'
    and exists (
      select 1
      from public.lojas
      where lojas.id::text = (storage.foldername(name))[1]
        and lojas.lojista_id = auth.uid()
    )
  );

