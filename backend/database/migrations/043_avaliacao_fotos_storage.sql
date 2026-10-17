create index if not exists idx_avaliacao_fotos_avaliacao
  on public.avaliacao_fotos (avaliacao_id);

create policy "avaliacao_fotos: exclusão pelo autor da avaliação"
  on public.avaliacao_fotos for delete
  using (
    exists (
      select 1
      from public.avaliacoes
      where avaliacoes.id = avaliacao_fotos.avaliacao_id
        and avaliacoes.usuario_id = auth.uid()
    )
  );

create policy "fotos_avaliacoes: inserção pelo autor"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fotos-avaliacoes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.avaliacoes
      where avaliacoes.id::text = (storage.foldername(name))[2]
        and avaliacoes.usuario_id = auth.uid()
    )
  );

create policy "fotos_avaliacoes: exclusão pelo autor"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'fotos-avaliacoes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.avaliacoes
      where avaliacoes.id::text = (storage.foldername(name))[2]
        and avaliacoes.usuario_id = auth.uid()
    )
  );
