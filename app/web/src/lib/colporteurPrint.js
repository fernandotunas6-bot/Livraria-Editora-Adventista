/**
 * Guias e extractos para imprimir (ou guardar em PDF pelo browser). Abre uma janela só com o
 * documento; o texto vem da base de dados e é escapado.
 */
import { LEDGER_KINDS, ledgerWithBalance } from '@/lib/colporteurReports';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kz = (v) => `${Number(v || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const KIND = { entrega: 'Guia de entrega à consignação', devolucao: 'Guia de devolução', compra: 'Guia de compra com desconto' };

const STYLE = `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;font-size:13px}
h1{font-size:20px;margin:0 0 4px}p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#555}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:700;border-top:2px solid #111}
.sig{display:flex;gap:48px;margin-top:56px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}
.muted{color:#666}@media print{body{margin:12mm}}`;

/** HTML de uma guia. */
export function documentHtml({ doc, colporteur, brandName = 'Livraria Adventista' }) {
  const purchase = doc.kind === 'compra';
  const rows = (doc.lines || []).map((l) => `<tr><td>${esc(l.book_code)}</td><td>${esc(l.title)}</td><td class="n">${esc(l.qty)}</td>
    <td class="n">${kz(l.unit_price)}</td>${purchase ? `<td class="n">${esc(l.pct)}%</td>` : ''}<td class="n">${kz(l.unit_price * l.qty)}</td></tr>`).join('');
  const discount = purchase ? `<tr><td colspan="5">Desconto do colportor</td><td class="n">− ${kz(doc.discount_value)}</td></tr>` : '';
  const totalLabel = doc.kind === 'devolucao' ? 'Total devolvido' : purchase ? 'Total a pagar' : 'Total entregue (a prestar contas)';
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(doc.number)}</title><style>${STYLE}</style></head><body>
  <h1>${esc(KIND[doc.kind] || 'Guia')} · ${esc(doc.number)}</h1>
  <p class="muted">${esc(brandName)} · ${new Date(doc.created).toLocaleString('pt-AO')}</p>
  <p><strong>Colportor:</strong> ${esc(colporteur?.code)} · ${esc(colporteur?.full_name)} · ${esc(colporteur?.phone)}</p>
  ${doc.notes ? `<p><strong>Notas:</strong> ${esc(doc.notes)}</p>` : ''}
  <table><thead><tr><th>Código</th><th>Título</th><th class="n">Qtd</th><th class="n">Preço de capa</th>${purchase ? '<th class="n">Desc.</th>' : ''}<th class="n">Valor</th></tr></thead>
  <tbody>${rows}${discount}<tr class="tot"><td colspan="${purchase ? 5 : 4}">${totalLabel}</td><td class="n">${kz(Math.abs(doc.amount))}</td></tr></tbody></table>
  <div class="sig"><div>Pela Livraria</div><div>O colportor</div></div>
  </body></html>`;
}

/** HTML do extracto da conta corrente. */
export function statementHtml({ colporteur, entries, inHand = [], brandName = 'Livraria Adventista' }) {
  const withBalance = ledgerWithBalance(entries);
  const rows = withBalance.map((e) => `<tr><td>${esc(e.entry_date)}</td><td>${esc(LEDGER_KINDS[e.kind] || e.kind)}</td>
    <td>${esc(e.description)}${e.reference ? ` · ${esc(e.reference)}` : ''}</td><td class="n">${Number(e.amount) > 0 ? kz(e.amount) : ''}</td>
    <td class="n">${Number(e.amount) < 0 ? kz(-e.amount) : ''}</td><td class="n">${kz(e.balance)}</td></tr>`).join('');
  const last = withBalance.at(-1)?.balance || 0;
  const hand = inHand.length ? `<h2 style="font-size:15px;margin-top:24px">Livros à consignação em mão</h2><table><thead><tr><th>Código</th><th>Título</th><th class="n">Qtd</th><th class="n">Valor</th></tr></thead><tbody>${
    inHand.map((b) => `<tr><td>${esc(b.book_code)}</td><td>${esc(b.title)}</td><td class="n">${esc(b.qty)}</td><td class="n">${kz(b.qty * b.unit_price)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Extracto ${esc(colporteur?.code)}</title><style>${STYLE}</style></head><body>
  <h1>Extracto de conta · ${esc(colporteur?.code)} · ${esc(colporteur?.full_name)}</h1>
  <p class="muted">${esc(brandName)} · ${new Date().toLocaleString('pt-AO')}</p>
  <table><thead><tr><th>Data</th><th>Movimento</th><th>Descrição</th><th class="n">Deve</th><th class="n">Haver</th><th class="n">Saldo</th></tr></thead><tbody>${rows}
  <tr class="tot"><td colspan="5">${last > 0 ? 'O colportor deve à Livraria' : last < 0 ? 'A Livraria deve ao colportor' : 'Contas certas'}</td><td class="n">${kz(Math.abs(last))}</td></tr></tbody></table>
  ${hand}
  <div class="sig"><div>Pela Livraria</div><div>O colportor</div></div>
  </body></html>`;
}

/** Abre a janela de impressão. Devolve false se o browser bloqueou a janela. */
export function openPrint(html) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}
