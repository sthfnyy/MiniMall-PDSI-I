alter policy "profiles: atualização própria"
  on public.profiles
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (nome_completo, telefone, avatar_url) on public.profiles to authenticated;
