// Camada de persistência ligada ao Supabase (veja supabase/schema.sql).
// Mantém a mesma interface (get/set/delete/list) do artifact original do
// Claude.ai, para que App.jsx não precise mudar: cada "chave" (oficinas,
// ambientes, inscricoes) corresponde a uma tabela, e get/set sempre
// trabalham com a lista inteira daquela tabela, como App.jsx espera.

import { supabase } from "./supabaseClient";

const TABLES = {
  oficinas: {
    table: "oficinas",
    idField: "id",
    orderBy: "created_at",
    toRow: (o) => ({
      id: o.id,
      professor: o.professor,
      nome: o.nome,
      descricao: o.descricao,
      qtd_alunos: o.qtdAlunos,
      materiais: o.materiais ?? null,
      ambiente_tipo: o.ambienteTipo,
      ambiente_detalhe: o.ambienteDetalhe ?? null,
      status: o.status,
      vagas: o.vagas ?? null,
      ambiente_alocado: o.ambienteAlocado ?? null,
      feedback: o.feedback ?? null,
      created_at: new Date(o.createdAt ?? Date.now()).toISOString(),
    }),
    fromRow: (r) => ({
      id: r.id,
      professor: r.professor,
      nome: r.nome,
      descricao: r.descricao,
      qtdAlunos: r.qtd_alunos,
      materiais: r.materiais ?? "",
      ambienteTipo: r.ambiente_tipo,
      ambienteDetalhe: r.ambiente_detalhe ?? "",
      status: r.status,
      vagas: r.vagas,
      ambienteAlocado: r.ambiente_alocado ?? "",
      feedback: r.feedback ?? "",
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
      oficina_id: i.oficinaId,
      timestamp: new Date(i.timestamp ?? Date.now()).toISOString(),
    }),
    fromRow: (r) => ({
      matricula: r.matricula,
      nomeAluno: r.nome_aluno,
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

  async set(key, value) {
    const cfg = TABLES[key];
    if (!cfg) throw new Error(`Chave de storage desconhecida: ${key}`);

    const incoming = JSON.parse(value);
    const rows = incoming.map(cfg.toRow);
    const incomingIds = rows.map((r) => r[cfg.idField]);

    const { data: existing, error: selectError } = await supabase
      .from(cfg.table)
      .select(cfg.idField);
    if (selectError) throw selectError;

    const toDelete = existing
      .map((r) => r[cfg.idField])
      .filter((id) => !incomingIds.includes(id));

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
      if (upsertError) throw upsertError;
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
