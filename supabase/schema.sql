-- LiterArena — schema Supabase (Postgres)
--
-- Corresponde ao modelo hoje salvo em localStorage por src/lib/storage.js
-- (chaves "oficinas", "ambientes", "inscricoes"). Rode este arquivo inteiro
-- no SQL Editor do projeto Supabase depois de criá-lo.

create extension if not exists "pgcrypto";

-- ambientes: espaços disponíveis no festival (salas e outros locais)
create table if not exists ambientes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  capacidade  int4 not null default 0,
  tipo        text not null default 'sala' check (tipo in ('sala', 'outro'))
);

-- oficinas: propostas cadastradas por professores, aprovadas pela coordenação
create table if not exists oficinas (
  id                uuid primary key default gen_random_uuid(),
  professor         text not null,
  nome              text not null,
  descricao         text not null,
  qtd_alunos        int4 not null,
  materiais         text,
  ambiente_tipo     text not null default 'sala' check (ambiente_tipo in ('sala', 'outro')),
  ambiente_detalhe  text,
  status            text not null default 'pendente' check (status in ('pendente', 'aprovada', 'ajustes')),
  vagas             int4,
  ambiente_alocado  text,   -- guarda o NOME do ambiente escolhido (não o id — ver src/App.jsx)
  feedback          text,
  created_at        timestamptz not null default now()
);

-- inscricoes: alunos inscritos em uma oficina (1 inscrição por matrícula)
create table if not exists inscricoes (
  matricula   text primary key,
  nome_aluno  text not null,
  oficina_id  uuid not null references oficinas(id) on delete cascade,
  "timestamp" timestamptz not null default now()
);

create index if not exists inscricoes_oficina_id_idx on inscricoes (oficina_id);

-- RLS: o app hoje não tem autenticação (login é só nome/matrícula digitados),
-- então as policies abaixo liberam leitura/escrita para a chave "anon".
-- Isso é adequado para uso interno do festival, mas não protege contra
-- alguém de fora do colégio acessando a URL do Supabase diretamente.
-- Se quiser mais segurança, adicione autenticação (Supabase Auth) antes de
-- restringir estas policies por usuário.

alter table ambientes enable row level security;
alter table oficinas enable row level security;
alter table inscricoes enable row level security;

create policy "ambientes: leitura publica" on ambientes for select using (true);
create policy "ambientes: escrita publica" on ambientes for all using (true) with check (true);

create policy "oficinas: leitura publica" on oficinas for select using (true);
create policy "oficinas: escrita publica" on oficinas for all using (true) with check (true);

create policy "inscricoes: leitura publica" on inscricoes for select using (true);
create policy "inscricoes: escrita publica" on inscricoes for all using (true) with check (true);
