// Página de teste do Painel de Vendas de uma loja (e2e/painel-vendas.spec.js).
//
// Monta o painel como o separador «Vendas por loja» o monta (components/admin/VendasHuamboTab.jsx):
// o mesmo `mountPainel`, o mesmo CSS e o mesmo HTML num Shadow DOM. Os dados vêm de uma api em
// memória com a forma de `createPainelApi` (painel-vendas/adapter.js) e os números do Huambo.
//
// O que interessa provar é o build de produção: o defeito que isto apanha (o `.transition()` do d3
// que o tree-shaking tirava) só existia depois de compilado. Por isso esta página é compilada com
// o `vite build` (vite.config.js ao lado) e servida pelo `vite preview`, como o site.
import { mountPainel } from '@/painel-vendas/painel.js';
import css from '@/painel-vendas/painel.css?inline';
import markup from '@/painel-vendas/painel.html?raw';

const vazio = () => Array(12).fill('');
const ANOS = {
  2025: { ano: 2025, meses: [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 900000, 1112765], observacoes: vazio(), mes_em_curso: null, meta_anual: null, criterio: 'media', fonte: 'Teste', actualizado: '2026-11-01T10:00:00.111111+00:00' },
  2026: { ano: 2026, meses: [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null], observacoes: vazio(), mes_em_curso: 11, meta_anual: null, criterio: 'media', fonte: 'Teste', actualizado: '2026-11-01T10:00:00.222222+00:00' },
};

// `?editar=1`: com permissão para gravar (as gravações ficam em window.__gravacoes, com o
// `esperado` que o painel mandou) e com vendas do sistema (1 encomenda do site em Outubro).
const editar = new URLSearchParams(window.location.search).has('editar');
window.__gravacoes = [];

const snap = (id, data) => ({ id: String(id), exists: !!data, data: () => data, metadata: {} });
const db = {
  collection: () => ({
    onSnapshot(next) {
      next({ docs: Object.values(ANOS).map((a) => snap(a.ano, a)), metadata: { fromCache: false } });
      return () => {};
    },
  }),
  doc: (path) => ({
    get: async () => snap(path, null),
    onSnapshot(next) { next(snap(path, null)); return () => {}; },
    set: async (value, opts) => {
      window.__gravacoes.push({ path, value, opts: opts || null });
      return { actualizado: '2026-11-14T12:00:00.333333+00:00' };
    },
    delete: async () => {},
  }),
};

const api = {
  db,
  user: { id: async () => 'teste', isOwner: async () => false, canEdit: async () => editar, can: async () => editar, profiles: async () => ({}) },
  downloads: { save: async () => ({ status: 'saved' }) },
  store: { id: 'loja-huambo', name: 'Livraria Adventista — Huambo', province: 'Huambo' },
  sales: editar
    ? {
      available: true,
      storeName: 'Livraria Adventista — Huambo',
      fetch: async () => ({ months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 21665, 0, 0], counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], orders: 1 }),
    }
    : { available: false, reason: 'Página de teste.' },
  extras: null,
  historico: async () => [],
};

window.__erros = [];
window.addEventListener('error', (e) => window.__erros.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__erros.push(String((e.reason && e.reason.message) || e.reason)));

const root = document.getElementById('host').attachShadow({ mode: 'open' });
root.innerHTML = `<style>${css}</style>${markup.replace('__LOGO__', '')}`;
window.__painel = root;
mountPainel(root, api);
