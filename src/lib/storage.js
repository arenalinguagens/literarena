// Camada de persistência ligada ao Supabase (veja supabase/schema.sql).
// Mantém a mesma interface (get/set/delete/list) do artifact original do
// Claude.ai, para que App.jsx não precise mudar: cada "chave" (oficinas,
// ambientes, inscricoes) corresponde a uma tabela, e get/set sempre
// trabalham com a lista inteira daquela tabela, como App.jsx espera.

import { supabase } from "./supabaseClient";

// PGRST204 = PostgREST não achou a coluna no schema cache; 42703 = Postgres
// "coluna não existe". Cobre os dois formatos de erro que podem chegar aqui.
function colunaAusente(error) {
  return (
    error?.code === "PGRST204" ||
    error?.code === "42703" ||
    /column .* (does not exist|schema cache)/i.test(error?.message || "")
  );
}

const TABLES = {
  oficinas: {
    table: "oficinas",
    idField: "id",
    orderBy: "created_at",
    toRow: (o) => ({
      id: o.id,
      professor: o.professor,
      nome: o.nome,
      modo_equipe: o.modoEquipe ?? "sozinho",
      colegas: o.colegas ?? null,
      descricao: o.descricao,
      qtd_alunos: o.qtdAlunos,
      materiais: o.materiais ?? null,
      materiais_necessarios: o.materiaisNecessarios ?? null,
      ambiente_tipo: o.ambienteTipo,
      ambiente_detalhe: o.ambienteDetalhe ?? null,
      status: o.status,
      vagas: o.vagas ?? null,
      ambiente_alocado: o.ambienteAlocado ?? null,
      feedback: o.feedback ?? null,
      titulo_aprovado: o.tituloAprovado ?? true,
      descricao_aprovado: o.descricaoAprovado ?? true,
      ambiente_aprovado: o.ambienteAprovado ?? true,
      ambiente_sugestao: o.ambienteSugestao ?? null,
      created_at: new Date(o.createdAt ?? Date.now()).toISOString(),
    }),
    // Usado só se o banco ainda não tiver alguma coluna adicionada depois
    // do schema original (migração não rodada): salva a oficina mesmo
    // assim, sem esses campos, em vez de falhar a gravação inteira.
    toRowSemColunasNovas: (o) => {
      const row = TABLES.oficinas.toRow(o);
      delete row.modo_equipe;
      delete row.colegas;
      delete row.titulo_aprovado;
      delete row.descricao_aprovado;
      delete row.ambiente_aprovado;
      delete row.ambiente_sugestao;
      delete row.materiais_necessarios;
      return row;
    },
    fromRow: (r) => ({
      id: r.id,
      professor: r.professor,
      nome: r.nome,
      modoEquipe: r.modo_equipe ?? "sozinho",
      colegas: r.colegas ?? "",
      descricao: r.descricao,
      qtdAlunos: r.qtd_alunos,
      materiais: r.materiais ?? "",
      materiaisNecessarios: r.materiais_necessarios ?? "",
      ambienteTipo: r.ambiente_tipo,
      ambienteDetalhe: r.ambiente_detalhe ?? "",
      status: r.status,
      vagas: r.vagas,
      ambienteAlocado: r.ambiente_alocado ?? "",
      feedback: r.feedback ?? "",
      // Se a coluna ainda não existir no banco, trata como já aprovado
      // pra não travar "Aprovar" de oficinas antigas por causa disso.
      tituloAprovado: r.titulo_aprovado ?? true,
      descricaoAprovado: r.descricao_aprovado ?? true,
      ambienteAprovado: r.ambiente_aprovado ?? true,
      ambienteSugestao: r.ambiente_sugestao ?? "",
      createdAt: new Date(r.created_at).getTime(),
    }),
  },
  ambientes: {
    table: "ambientes",
    idField: "id",
    toRow: (a) => ({ id: a.id, nome: a.nome, capacidade: a.capacidade, tipo: a.tipo }),
    fromRow: (r) => ({ id: r.id, nome: r.nome, capacidade: r.capacidade, tipo: r.tipo }),
  },
  inscricoes: {
    table: "inscricoes",
    idField: "matricula",
    toRow: (i) => ({
      matricula: i.matricula,
      nome_aluno: i.nomeAluno,
      serie: i.serie ?? null,
      turma: i.turma ?? null,
      oficina_id: i.oficinaId,
      timestamp: new Date(i.timestamp ?? Date.now()).toISOString(),
    }),
    // Usado só se o banco ainda não tiver as colunas serie/turma (migração
    // não rodada): salva a inscrição mesmo assim, sem esses dois campos.
    toRowSemColunasNovas: (i) => {
      const row = TABLES.inscricoes.toRow(i);
      delete row.serie;
      delete row.turma;
      return row;
    },
    fromRow: (r) => ({
      matricula: r.matricula,
      nomeAluno: r.nome_aluno,
      serie: r.serie ?? "",
      turma: r.turma ?? "",
      oficinaId: r.oficina_id,
      timestamp: new Date(r.timestamp).getTime(),
    }),
  },
};

export const storage = {
  async get(key) {
    const cfg = TABLES[key];
    if (!cfg) return null;

    let query = supabase.from(cfg.table).select("*");
    if (cfg.orderBy) query = query.order(cfg.orderBy, { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    return { value: JSON.stringify(data.map(cfg.fromRow)) };
  },

  // `previous` é a lista que ESTE navegador tinha antes da edição (o estado
  // local de antes do clique que gerou esse save). Só apagamos do banco uma
  // linha que estava em `previous` e não está mais em `value` — ou seja,
  // algo que o usuário removeu de propósito. Uma linha que outra pessoa
  // criou depois do último carregamento deste navegador nunca é apagada só
  // por não aparecer na lista local, mesmo que a lista local seja antiga.
  async set(key, value, previous = []) {
    const cfg = TABLES[key];
    if (!cfg) throw new Error(`Chave de storage desconhecida: ${key}`);

    const incoming = JSON.parse(value);
    const rows = incoming.map(cfg.toRow);
    const incomingIds = new Set(rows.map((r) => r[cfg.idField]));

    const toDelete = previous
      .map((p) => p[cfg.idField])
      .filter((id) => !incomingIds.has(id));

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from(cfg.table)
        .delete()
        .in(cfg.idField, toDelete);
      if (deleteError) throw deleteError;
    }

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from(cfg.table)
        .upsert(rows, { onConflict: cfg.idField });

      if (upsertError) {
        // Coluna nova ainda não existe no banco (migração não rodada) —
        // tenta salvar de novo sem ela, pra nunca perder a oficina inteira
        // por causa de um campo extra.
        if (cfg.toRowSemColunasNovas && colunaAusente(upsertError)) {
          const rowsSemColunasNovas = incoming.map(cfg.toRowSemColunasNovas);
          const { error: fallbackError } = await supabase
            .from(cfg.table)
            .upsert(rowsSemColunasNovas, { onConflict: cfg.idField });
          if (fallbackError) throw fallbackError;
        } else {
          throw upsertError;
        }
      }
    }

    return { value };
  },

  async delete(key) {
    const cfg = TABLES[key];
    if (!cfg) return;
    await supabase.from(cfg.table).delete().neq(cfg.idField, "");
  },

  async list(prefix = "") {
    return { keys: Object.keys(TABLES).filter((k) => k.startsWith(prefix)) };
  },
};
