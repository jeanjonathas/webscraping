-- Tabela de clientes
create table if not exists public.clientes (
  id bigint primary key generated always as identity,
  codigo text not null unique,
  nome text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Tabela de animais
create table if not exists public.animais (
  id bigint primary key generated always as identity,
  codigo text not null unique,
  nome text not null,
  cliente_id bigint references clientes(id),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Índices para melhorar performance das buscas
create index if not exists idx_clientes_codigo on public.clientes(codigo);
create index if not exists idx_clientes_nome on public.clientes(nome);
create index if not exists idx_animais_codigo on public.animais(codigo);
create index if not exists idx_animais_cliente_id on public.animais(cliente_id);
