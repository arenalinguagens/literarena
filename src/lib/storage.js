// Camada de persistência local (localStorage), mantendo a mesma interface
// (get/set/delete/list) do artifact original do Claude.ai, para que
// App.jsx possa ser trocado por um backend real (ex.: Supabase) trocando
// apenas este arquivo.

const PREFIX = "literarena:";

function fullKey(key, global) {
  return global ? `${PREFIX}${key}` : `${PREFIX}local:${key}`;
}

export const storage = {
  async get(key, global = false) {
    const raw = localStorage.getItem(fullKey(key, global));
    return raw === null ? null : { value: raw };
  },

  async set(key, value, global = false) {
    localStorage.setItem(fullKey(key, global), value);
    return { value };
  },

  async delete(key, global = false) {
    localStorage.removeItem(fullKey(key, global));
  },

  async list(prefix = "", global = false) {
    const base = fullKey(prefix, global);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(base)) {
        keys.push(k.slice(fullKey("", global).length));
      }
    }
    return { keys };
  },
};
