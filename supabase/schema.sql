-- LiterArena — schema Supabase (Postgres)
--
-- Corresponde ao modelo hoje salvo em localStorage por src/lib/storage.js
-- (chaves "oficinas", "ambientes", "inscricoes"). Rode este arquivo inteiro
-- no SQL Editor do projeto Supabase depois de criá-lo.
--
-- Os ids são gerados no app (função uid() em src/App.jsx), não no banco —
-- por isso são "text" e não "uuid".

-- ambientes: espaços disponíveis no festival (salas e outros locais)
create table if not exists ambientes (
  id          text primary key,
  nome        text not null,
  capacidade  int4 not null default 0,
  tipo        text not null default 'sala' check (tipo in ('sala', 'outro'))
);

-- oficinas: propostas cadastradas por professores, aprovadas pela coordenação
create table if not exists oficinas (
  id                text primary key,
  professor         text not null,
  nome              text not null,
  modo_equipe       text not null default 'sozinho' check (modo_equipe in ('sozinho', 'parceria')),
  colegas           text,   -- nomes dos professores parceiros, quando modo_equipe = 'parceria'
  descricao         text not null,
  qtd_alunos        int4 not null,
  materiais         text,   -- materiais que o ALUNO deve levar (aparece no comprovante)
  materiais_necessarios text,  -- materiais que o PROFESSOR precisa que a coordenação providencie
  ambiente_tipo     text not null default 'sala' check (ambiente_tipo in ('sala', 'outro')),
  ambiente_detalhe  text,
  status            text not null default 'pendente' check (status in ('pendente', 'aprovada', 'ajustes')),
  vagas             int4,   -- legado (antes da divisão por sessão); mantido por compatibilidade
  vagas_67          int4,   -- vagas da sessão do 6º/7º ano (3º horário)
  vagas_89          int4,   -- vagas da sessão do 8º/9º ano (5º horário)
  grupo_67          boolean not null default true,  -- oficina oferecida na sessão do 6º/7º ano
  grupo_89          boolean not null default true,  -- oficina oferecida na sessão do 8º/9º ano
  ambiente_alocado  text,   -- guarda o NOME do ambiente escolhido (não o id — ver src/App.jsx)
  -- Quando ambiente_alocado = "Sala a confirmar", guarda qual sala de
  -- aula comum vai ser usada em CADA sessão (ex.: "Sala do 8º ano A"
  -- pro 6º/7º, "Sala do 6º ano C" pro 8º/9º) — as duas sessões
  -- acontecem em horários diferentes, então dá pra usar a sala de uma
  -- turma que não está em aula nesse horário.
  sala_numero_67    text,
  sala_numero_89    text,
  feedback          text,
  titulo_aprovado     boolean not null default true,  -- false quando a coordenação cadastra em nome do professor
  descricao_aprovado  boolean not null default true,
  ambiente_aprovado   boolean not null default true,  -- false quando a coordenação já reservou o ambiente em nome do professor
  ambiente_sugestao   text,   -- preenchido pelo professor quando ele prefere outro ambiente
  comprovante_mostrar_horario    boolean not null default true,  -- controla o que aparece no comprovante DESTA oficina
  comprovante_mostrar_local      boolean not null default true,
  comprovante_mostrar_materiais  boolean not null default true,
  ordem             int4,   -- posição explícita na lista "Escolher Oficina" (menor primeiro); sem valor = depois, em ordem alfabética
  creditos          text,   -- texto livre exibido no lugar de "Prof. {professor}" (ex.: "Profas. Elaine, Kaila e Lorena"); sem valor = usa o cálculo padrão
  created_at        timestamptz not null default now()
);

-- inscricoes: alunos inscritos em uma oficina (1 inscrição por matrícula).
-- oficina_id fica nulo (não é apagado em cascata) se a oficina for
-- removida, porque a inscrição do aluno deve continuar valendo como
-- registro (o app mostra "Oficina removida" nesse caso — ver AlunoPortal).
create table if not exists inscricoes (
  matricula   text primary key,
  nome_aluno  text not null,
  serie       text,   -- "6º ano" a "9º ano"
  turma       text,
  oficina_id  text references oficinas(id) on delete set null,
  "timestamp" timestamptz not null default now()
);

create index if not exists inscricoes_oficina_id_idx on inscricoes (oficina_id);

-- Trava de vagas no banco: o app confere vagas no navegador antes de
-- inscrever, mas isso sozinho não impede que dois alunos cliquem ao
-- mesmo tempo na última vaga e os dois passem na conferência (cada um
-- vendo uma cópia da tela de antes do outro gravar). Esse gatilho
-- recalcula a ocupação DENTRO da transação do insert/update, travando a
-- linha da oficina primeiro (for update) pra duas tentativas concorrentes
-- pela mesma oficina serializarem em vez de passarem juntas.
--
-- As vagas de cada sessão (vagas_67/89) são divididas meio a meio entre
-- as duas séries dela, pra uma série não lotar a oficina sozinha e
-- deixar a outra sem vaga nenhuma. Quando o total é ímpar, a série com
-- mais alunos no colégio fica com a vaga extra: 6º (283) > 7º (247);
-- 9º (325) > 8º (305). Essa regra PRECISA ficar igual à função
-- vagasPorSerie em src/App.jsx.
create or replace function checar_vagas_inscricao() returns trigger as $$
declare
  v_vagas_grupo int4;
  v_metade int4;
  v_resto int4;
  v_vagas_serie int4;
  v_ocupadas int4;
begin
  if new.oficina_id is null then
    return new;
  end if;

  if new.serie not in ('6º ano', '7º ano', '8º ano', '9º ano') then
    return new; -- série não reconhecida: não é esse gatilho que valida isso
  end if;

  -- Trava a linha da oficina: concorrentes pela MESMA oficina esperam
  -- aqui, serializando a contagem abaixo (sem isso, duas transações
  -- concorrentes poderiam contar a mesma vaga livre e ambas passarem).
  perform 1 from oficinas where id = new.oficina_id for update;

  if new.serie in ('6º ano', '7º ano') then
    select vagas_67 into v_vagas_grupo from oficinas where id = new.oficina_id;
  else
    select vagas_89 into v_vagas_grupo from oficinas where id = new.oficina_id;
  end if;

  if v_vagas_grupo is null then
    return new; -- sem limite definido pra essa sessão: não trava
  end if;

  v_metade := v_vagas_grupo / 2; -- divisão inteira
  v_resto := v_vagas_grupo % 2;

  if new.serie in ('6º ano', '9º ano') then
    v_vagas_serie := v_metade + v_resto;
  else
    v_vagas_serie := v_metade;
  end if;

  select count(*) into v_ocupadas
  from inscricoes i
  where i.oficina_id = new.oficina_id
    and i.matricula <> new.matricula
    and i.serie = new.serie;

  if v_ocupadas >= v_vagas_serie then
    raise exception 'OFICINA_LOTADA' using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_checar_vagas_inscricao on inscricoes;
create trigger trg_checar_vagas_inscricao
  before insert or update of oficina_id, serie on inscricoes
  for each row execute function checar_vagas_inscricao();

-- fila_espera: registro de interesse de um aluno numa oficina já lotada
-- (não garante vaga — é só pra coordenação saber quem avisar se abrir
-- uma). Separada de "inscricoes" de propósito: o aluno continua sem
-- inscrição de verdade e precisa escolher outra oficina com vaga. Um
-- aluno pode entrar na fila de mais de uma oficina (sem chave única por
-- matrícula). Some junto se a oficina for removida.
create table if not exists fila_espera (
  id          text primary key,
  matricula   text not null,
  nome_aluno  text not null,
  serie       text,
  turma       text,
  oficina_id  text not null references oficinas(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists fila_espera_oficina_id_idx on fila_espera (oficina_id);

-- configuracoes: pares chave/valor pro app (uma linha por configuração,
-- valor em JSON). Hoje só tem "cards_aluno", que controla quais campos
-- aparecem nos cards de oficina pro aluno (ver RelatorioInscricoes/
-- AlunoPortal em src/App.jsx).
create table if not exists configuracoes (
  id     text primary key,
  valor  jsonb not null default '{}'::jsonb
);

-- alunos: matrícula oficial de todos os alunos, importada da secretaria.
-- Só é lida pelo app (relatório de pendências em Relatórios, que cruza
-- com "inscricoes" por matrícula) — nunca é editada pelo app.
create table if not exists alunos (
  matricula  text primary key,
  nome       text not null,
  serie      text not null,
  turma      text not null
);

-- professores: login do professor (nome + senha). A senha nunca é
-- guardada em texto puro — só salt + hash (ver src/lib/auth.js).
create table if not exists professores (
  nome_normalizado  text primary key,  -- nome em minúsculas/sem espaços nas pontas
  nome              text not null,
  salt              text not null,
  senha_hash        text not null,
  created_at        timestamptz not null default now()
);

-- RLS: o app hoje não tem autenticação de servidor (login é feito no
-- navegador comparando hashes), então as policies abaixo liberam
-- leitura/escrita para a chave "anon". Isso é adequado para uso interno
-- do festival, mas não protege contra alguém de fora do colégio
-- acessando a URL do Supabase diretamente. Se quiser mais segurança,
-- adicione Supabase Auth de verdade antes de restringir estas policies.

alter table ambientes enable row level security;
alter table oficinas enable row level security;
alter table inscricoes enable row level security;
alter table professores enable row level security;
alter table fila_espera enable row level security;
alter table configuracoes enable row level security;
alter table alunos enable row level security;

create policy "ambientes: leitura publica" on ambientes for select using (true);
create policy "ambientes: escrita publica" on ambientes for all using (true) with check (true);

create policy "oficinas: leitura publica" on oficinas for select using (true);
create policy "oficinas: escrita publica" on oficinas for all using (true) with check (true);

create policy "inscricoes: leitura publica" on inscricoes for select using (true);
create policy "inscricoes: escrita publica" on inscricoes for all using (true) with check (true);

create policy "fila_espera: leitura publica" on fila_espera for select using (true);
create policy "fila_espera: escrita publica" on fila_espera for all using (true) with check (true);

create policy "configuracoes: leitura publica" on configuracoes for select using (true);
create policy "configuracoes: escrita publica" on configuracoes for all using (true) with check (true);

-- alunos: só leitura (nunca é editada pelo app, só importada por SQL
-- direto — ver observação na definição da tabela acima).
create policy "alunos: leitura publica" on alunos for select using (true);

-- professores: leitura, criação de conta e atualização de senha (usada
-- pela coordenação para redefinir a senha de quem esqueceu — ver
-- src/lib/auth.js). Sem policy de delete: não dá pra apagar conta pelo
-- app hoje.
create policy "professores: leitura publica" on professores for select using (true);
create policy "professores: criar conta" on professores for insert with check (true);
create policy "professores: atualizar senha" on professores for update using (true) with check (true);
