# LiterArena

Sistema de gestão do Festival de Literatura do Colégio Arena — cadastro de
oficinas pelos professores, aprovação pela coordenação e inscrição dos alunos.

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Build de produção

```bash
npm run build
npm run preview
```

Gera a pasta `dist/`, pronta para publicar em qualquer hospedagem estática
(Vercel, Netlify, GitHub Pages, etc.).

## ⚠️ Sobre o armazenamento de dados

Este projeto foi adaptado do protótipo original (feito como artifact no
Claude.ai) para rodar como app independente. A persistência hoje usa
`localStorage` (veja `src/lib/storage.js`), o que significa:

- Os dados ficam salvos **só no navegador de cada pessoa**.
- Um professor, um aluno e a coordenação, em aparelhos diferentes, **não
  verão os mesmos dados** — cada um tem sua própria cópia local.

Isso é suficiente para testar o fluxo e a interface, mas **não é adequado
para o uso real do festival**, onde professores, alunos e coordenação
precisam compartilhar as mesmas informações em tempo real.

### Para uso real (dados compartilhados entre todos)

Será preciso trocar `src/lib/storage.js` por chamadas a um backend real.
Opções simples:

- **Supabase** (Postgres gerenciado, fácil de integrar com React, tem plano
  gratuito) — a opção mais recomendada para este caso.
- **Firebase Firestore** — alternativa parecida, do Google.

A interface do `storage.js` (`get`, `set`, `delete`, `list`) foi mantida
igual à do artifact original — se quiser, é possível reescrever só esse
arquivo para apontar para o Supabase/Firebase sem tocar no resto do app.

## Estrutura

```
src/
  App.jsx          # Todo o app: portais de Professor, Aluno e Coordenação
  lib/storage.js    # Camada de persistência (hoje: localStorage)
  main.jsx          # Ponto de entrada React
  index.css         # Diretivas do Tailwind
```
