// Página de teste do relatório de todas as livrarias (e2e/painel-vendas.spec.js), montado como em
// components/admin/RelatoriosLojasTab.jsx, com uma api em memória da forma de createConsolidadoApi
// (painel-vendas/adapter.js) e os números das três lojas até Outubro de 2026.
import { mountConsolidado } from '@/painel-vendas/consolidado-ui.js';
import cssPainel from '@/painel-vendas/painel.css?inline';
import cssConjunto from '@/painel-vendas/consolidado.css?inline';
import markup from '@/painel-vendas/consolidado.html?raw';

const vazio = () => Array(12).fill('');
const ano = (a, meses, extra = {}) => ({ ano: a, meses, observacoes: vazio(), mes_em_curso: null, meta_anual: null, criterio: 'media', fonte: 'Teste', origem: 'importacao', actualizado: `2026-11-01T10:00:00.${a}00+00:00`, ...extra });
const LOJAS = [
  { id: 'huambo', name: 'Livraria Adventista — Huambo', province: 'Huambo', active: true, years: {
    2025: ano(2025, [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 900000, 1112765]),
    2026: ano(2026, [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null], { mes_em_curso: 11 }),
  } },
  { id: 'lubango', name: 'Livraria Adventista — Lubango', province: 'Huíla', active: true, years: {
    2025: ano(2025, [522850, 118050, 882750, 482975, 1030825, 453760, 244514, 52650, 827125, 974128, 106750, 1633117]),
    2026: ano(2026, [361593, 158750, 269612, 379850, 708435, 319145, 1099129, 187333, 389550, 1353345, null, null]),
  } },
  { id: 'catumbela', name: 'Livraria Adventista — Catumbela', province: 'Benguela', active: true, years: {
    2026: ano(2026, [0, 0, 383770, 601925, 526320, 565050, 577190, 292890, 814484, 930916, null, null]),
  } },
];

window.__gravacoes = [];
window.__conflito = new URLSearchParams(window.location.search).has('conflito');
const api = {
  canEdit: true,
  carregar: async () => JSON.parse(JSON.stringify(LOJAS)),
  sistema: async () => ({ porLoja: { huambo: { months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 21665, 0, 0], counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0] } }, semLoja: { months: Array(12).fill(0), counts: Array(12).fill(0) }, orders: 1 }),
  async gravarMeses(a, linhas) {
    window.__gravacoes.push({ ano: a, linhas });
    if (window.__conflito) {
      const e = new Error('Os números de Livraria Adventista — Huambo de 2026 mudaram depois de os abrir (outra pessoa gravou, ou o ano foi apagado). Recarregue: as suas alterações não foram gravadas.');
      e.code = 'conflict';
      throw e;
    }
    return {};
  },
  historico: async () => [],
  lerNota: async () => ({ texto: '', actualizado: null }),
  gravarNota: async () => {},
  downloads: { save: async () => ({ status: 'saved' }) },
  extras: async () => ({ destaques: null, fotos: [] }),
};

window.__erros = [];
window.addEventListener('error', (e) => window.__erros.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__erros.push(String((e.reason && e.reason.message) || e.reason)));

const root = document.getElementById('host').attachShadow({ mode: 'open' });
root.innerHTML = `<style>${cssPainel}\n${cssConjunto}</style>${markup.replace('__LOGO__', '').replace('__LOGO_CLARO__', '')}`;
mountConsolidado(root, api);
