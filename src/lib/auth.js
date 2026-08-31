// Login dos professores: nome + senha, guardados na tabela "professores"
// do Supabase (veja supabase/schema.sql). A senha nunca é salva em texto
// puro — cada conta tem um salt aleatório e só o hash (salt + senha) é
// gravado.
//
// Aviso: como o app não tem backend próprio, a policy de leitura da
// tabela é pública (a comparação do hash acontece no navegador). Isso
// evita senha em texto puro, mas não é segurança de nível bancário —
// oriente os professores a não reaproveitarem senhas importantes aqui.

import { supabase } from "./supabaseClient";

export function normalizarNome(nome) {
  return nome.trim().toLowerCase();
}

function bytesParaHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function gerarSalt() {
  return bytesParaHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function hashSenha(senha, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${senha}`));
  return bytesParaHex(new Uint8Array(buf));
}

export async function buscarProfessor(nome) {
  const { data, error } = await supabase
    .from("professores")
    .select("nome, salt, senha_hash")
    .eq("nome_normalizado", normalizarNome(nome))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function criarProfessor(nome, senha) {
  const salt = gerarSalt();
  const senha_hash = await hashSenha(senha, salt);
  const { error } = await supabase.from("professores").insert({
    nome_normalizado: normalizarNome(nome),
    nome: nome.trim(),
    salt,
    senha_hash,
  });
  if (error) {
    if (error.code === "23505") throw new Error("CONTA_JA_EXISTE");
    throw error;
  }
}

export async function senhaValida(nome, senha) {
  const professor = await buscarProfessor(nome);
  if (!professor) return false;
  return (await hashSenha(senha, professor.salt)) === professor.senha_hash;
}
