create extension if not exists pgcrypto;


create type public.user_role as enum ('admin', 'lojista', 'consumidor');
create type public.tipo_transacao_pontos as enum ('credito', 'resgate');
create type public.status_loja as enum ('pendente', 'aprovada', 'rejeitada');

create table public.profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    role            public.user_role not null default 'consumidor',
    nome_completo   text not null,
    telefone        text,
    avatar_url      text,
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);


create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome_completo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome_completo', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


create table public.lojas (
    id                      uuid primary key default gen_random_uuid(),
    lojista_id              uuid not null unique references auth.users(id) on delete cascade,
    nome_loja               text not null,
    descricao               text,
    endereco_logradouro     text,
    endereco_numero         text,
    endereco_bairro         text,
    endereco_cidade         text not null,
    endereco_uf             char(2) not null,
    endereco_cep            text,
    latitude                numeric(9,6),
    longitude               numeric(9,6),
    horario_funcionamento   jsonb,
    whatsapp                text not null,
    instagram               text,
    facebook                text,
    logo_url                text,
    status                  public.status_loja not null default 'pendente',
    motivo_rejeicao         text,
    aprovado_por            uuid references auth.users(id) on delete set null,
    aprovado_em             timestamptz,
    criado_em               timestamptz not null default now(),
    atualizado_em           timestamptz not null default now()
);

create index idx_lojas_cidade on public.lojas (endereco_cidade);
create index idx_lojas_status on public.lojas (status);


create function public.proteger_status_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('aprovada', 'rejeitada')
     and new.aprovado_em is null then
    new.aprovado_em := now();
  end if;
  return new;
end;
$$;

create trigger trg_proteger_status_loja
  before update on public.lojas
  for each row execute function public.proteger_status_loja();


create table public.categorias (
    id          uuid primary key default gen_random_uuid(),
    nome        text not null unique,
    criado_em   timestamptz not null default now()
);

create table public.produtos (
    id                  uuid primary key default gen_random_uuid(),
    loja_id             uuid not null references public.lojas(id) on delete cascade,
    categoria_id        uuid not null references public.categorias(id) on delete restrict,
    titulo              text not null,
    descricao           text,
    preco_base          numeric(10,2) not null check (preco_base >= 0),
    foto_principal_url  text,
    ativo               boolean not null default true,
    criado_em           timestamptz not null default now(),
    atualizado_em       timestamptz not null default now()
);

create table public.visualizacoes (
    id          uuid primary key default gen_random_uuid(),
    produto_id  uuid references public.produtos(id) on delete cascade,
    loja_id     uuid references public.lojas(id) on delete cascade,
    usuario_id  uuid references auth.users(id) on delete set null,
    criado_em   timestamptz not null default now(),

    check (produto_id is not null or loja_id is not null)
);


create index idx_visualizacoes_produto
    on public.visualizacoes (produto_id);

create index idx_visualizacoes_loja
    on public.visualizacoes (loja_id);

create index idx_visualizacoes_criado_em
    on public.visualizacoes (criado_em);


create index idx_produtos_loja on public.produtos (loja_id);
create index idx_produtos_categoria on public.produtos (categoria_id);
create index idx_produtos_titulo_trgm on public.produtos using gin (to_tsvector('portuguese', titulo));


create table public.produto_fotos (
    id          uuid primary key default gen_random_uuid(),
    produto_id  uuid not null references public.produtos(id) on delete cascade,
    url         text not null,
    ordem       smallint not null default 0,
    criado_em   timestamptz not null default now()
);


create table public.variacoes_produto (
    id          uuid primary key default gen_random_uuid(),
    produto_id  uuid not null references public.produtos(id) on delete cascade,
    tamanho     text,
    cor         text,
    preco       numeric(10,2) check (preco >= 0), -- NULL = herda preco_base do produto
    sku         text,
    ativo       boolean not null default true,
    unique (produto_id, tamanho, cor)
);


create table public.favoritos (
    usuario_id  uuid not null references auth.users(id) on delete cascade,
    produto_id  uuid not null references public.produtos(id) on delete cascade,
    criado_em   timestamptz not null default now(),
    primary key (usuario_id, produto_id)
);


create table public.avaliacoes (
    id          uuid primary key default gen_random_uuid(),
    loja_id     uuid not null references public.lojas(id) on delete cascade,
    usuario_id  uuid not null references auth.users(id) on delete cascade,
    nota        smallint not null check (nota between 1 and 5),
    comentario  text,
    foto_url    text not null,
    criado_em   timestamptz not null default now()
);

create index idx_avaliacoes_loja on public.avaliacoes (loja_id);


create table public.avaliacao_fotos (
    id              uuid primary key default gen_random_uuid(),
    avaliacao_id    uuid not null references public.avaliacoes(id) on delete cascade,
    url             text not null,
    criado_em       timestamptz not null default now()
);


create table public.pontos_transacoes (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references auth.users(id) on delete cascade,
    loja_id         uuid not null references public.lojas(id) on delete cascade,
    tipo            public.tipo_transacao_pontos not null,
    quantidade      integer not null check (quantidade > 0),
    avaliacao_id    uuid references public.avaliacoes(id) on delete set null,
    descricao       text,
    criado_em       timestamptz not null default now()
);

create index idx_pontos_usuario_loja on public.pontos_transacoes (usuario_id, loja_id);


create view public.saldo_pontos_usuario_loja as
select
    usuario_id,
    loja_id,
    sum(case when tipo = 'credito' then quantidade else -quantidade end) as saldo
from public.pontos_transacoes
group by usuario_id, loja_id;


create function public.creditar_pontos_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pontos_transacoes (usuario_id, loja_id, tipo, quantidade, avaliacao_id, descricao)
  values (new.usuario_id, new.loja_id, 'credito', 10, new.id, 'Pontos por avaliação publicada');
  return new;
end;
$$;

create trigger trg_creditar_pontos_avaliacao
  after insert on public.avaliacoes
  for each row execute function public.creditar_pontos_avaliacao();


create function public.promover_a_lojista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set role = 'lojista', atualizado_em = now()
  where id = new.lojista_id
    and role <> 'admin';
  return new;
end;
$$;

create trigger trg_promover_a_lojista
  after insert on public.lojas
  for each row execute function public.promover_a_lojista();



alter table public.profiles enable row level security;
alter table public.lojas enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.produto_fotos enable row level security;
alter table public.variacoes_produto enable row level security;
alter table public.favoritos enable row level security;
alter table public.avaliacoes enable row level security;
alter table public.avaliacao_fotos enable row level security;
alter table public.pontos_transacoes enable row level security;
alter table public.visualizacoes enable row level security;


create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


create function public.owns_loja(p_loja_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lojas
    where id = p_loja_id and lojista_id = auth.uid()
  );
$$;


create policy "profiles: leitura própria ou admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: atualização própria"
  on public.profiles for update
  using (id = auth.uid());


create policy "lojas: leitura pública (aprovadas)"
  on public.lojas for select
  using (status = 'aprovada' or lojista_id = auth.uid() or public.is_admin());

create policy "lojas: atualização pelo dono ou admin"
  on public.lojas for update
  using (lojista_id = auth.uid() or public.is_admin());

create policy "lojas: inserção pelo próprio lojista"
  on public.lojas for insert
  with check (lojista_id = auth.uid());

create policy "lojas: exclusão pelo dono ou admin"
  on public.lojas for delete
  using (lojista_id = auth.uid() or public.is_admin());


create policy "categorias: leitura pública"
  on public.categorias for select
  using (true);

create policy "categorias: escrita apenas admin"
  on public.categorias for all
  using (public.is_admin())
  with check (public.is_admin());


create policy "produtos: leitura pública (ativos e loja aprovada)"
  on public.produtos for select
  using (
    (ativo = true and exists (
      select 1 from public.lojas
      where id = loja_id and status = 'aprovada'
    ))
    or public.owns_loja(loja_id)
    or public.is_admin()
  );

create policy "produtos: escrita pelo dono da loja"
  on public.produtos for all
  using (public.owns_loja(loja_id) or public.is_admin())
  with check (public.owns_loja(loja_id) or public.is_admin());


create policy "produto_fotos: leitura pública"
  on public.produto_fotos for select
  using (true);

create policy "produto_fotos: escrita pelo dono da loja"
  on public.produto_fotos for all
  using (public.owns_loja((select loja_id from public.produtos where id = produto_id)))
  with check (public.owns_loja((select loja_id from public.produtos where id = produto_id)));


create policy "variacoes: leitura pública"
  on public.variacoes_produto for select
  using (true);

create policy "variacoes: escrita pelo dono da loja"
  on public.variacoes_produto for all
  using (public.owns_loja((select loja_id from public.produtos where id = produto_id)))
  with check (public.owns_loja((select loja_id from public.produtos where id = produto_id)));


create policy "favoritos: apenas o próprio usuário"
  on public.favoritos for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());


create policy "avaliacoes: leitura pública"
  on public.avaliacoes for select
  using (true);

create policy "avaliacoes: inserção pelo próprio usuário autenticado"
  on public.avaliacoes for insert
  with check (usuario_id = auth.uid());

create policy "avaliacoes: exclusão pelo autor ou admin (moderação)"
  on public.avaliacoes for delete
  using (usuario_id = auth.uid() or public.is_admin());


create policy "avaliacao_fotos: leitura pública"
  on public.avaliacao_fotos for select
  using (true);

create policy "avaliacao_fotos: inserção pelo autor da avaliação"
  on public.avaliacao_fotos for insert
  with check (
    exists (
      select 1 from public.avaliacoes
      where id = avaliacao_id and usuario_id = auth.uid()
    )
  );


create policy "pontos: leitura pelo próprio usuário ou dono da loja"
  on public.pontos_transacoes for select
  using (usuario_id = auth.uid() or public.owns_loja(loja_id) or public.is_admin());


