/**
 * Guias e extractos para imprimir (ou guardar em PDF pelo browser). Abre uma janela só com o
 * documento; o texto vem da base de dados e é escapado.
 */
import { LEDGER_KINDS, ledgerWithBalance } from '@/lib/colporteurReports';
import qrcode from 'qrcode-generator';
import { FONTE_TITULOS, estiloBaseImpressao } from '@/lib/fontes';
import { CATEGORIES } from '@/lib/colporteurCommission';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kz = (v) => `${Number(v || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const KIND = { entrega: 'Guia de entrega à consignação', devolucao: 'Guia de devolução', compra: 'Guia de compra com desconto' };

const STYLE = `body{color:#111;margin:32px;font-size:13px}
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
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(doc.number)}</title><style>${estiloBaseImpressao()}
${STYLE}</style></head><body>
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
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Extracto ${esc(colporteur?.code)}</title><style>${estiloBaseImpressao()}
${STYLE}</style></head><body>
  <h1>Extracto de conta · ${esc(colporteur?.code)} · ${esc(colporteur?.full_name)}</h1>
  <p class="muted">${esc(brandName)} · ${new Date().toLocaleString('pt-AO')}</p>
  <table><thead><tr><th>Data</th><th>Movimento</th><th>Descrição</th><th class="n">Deve</th><th class="n">Haver</th><th class="n">Saldo</th></tr></thead><tbody>${rows}
  <tr class="tot"><td colspan="5">${last > 0 ? 'O colportor deve à Livraria' : last < 0 ? 'A Livraria deve ao colportor' : 'Contas certas'}</td><td class="n">${kz(Math.abs(last))}</td></tr></tbody></table>
  ${hand}
  <div class="sig"><div>Pela Livraria</div><div>O colportor</div></div>
  </body></html>`;
}

/**
 * O relatório mensal da colportagem (ou de outro período do Resumo), para imprimir ou guardar em
 * PDF e mandar à Missão: uma linha por colportor, igreja, distrito, província, campo ou loja, com
 * as perguntas do relatório de Evangelismo pela Literatura, as vendas e as comissões, e os totais.
 * `rows` e `totals` são os de summarize(); `weeks` (opcional) é o número de semanas do mês.
 */
export function summaryHtml({ title, period, groupLabel, rows, totals, weeks = null, withSite = false, notes = [], brandName = 'Livraria Adventista' }) {
  const n = (v) => Number(v || 0).toLocaleString('pt-AO', { maximumFractionDigits: 1 });
  const cols = [
    ['Relatórios', (r, total) => (weeks && !total && r.count === 1 ? `${n(r.reports)}/${weeks}` : n(r.reports))],
    ['Horas', (r) => n(r.hours)],
    ['Visitas', (r) => n(r.visits)],
    ['Orações', (r) => n(r.prayers)],
    ['Literatura', (r) => n(r.freeLiterature)],
    ['Estudos', (r) => n(r.bibleStudies)],
    ['Interessados', (r) => n(r.interests)],
    ['Baptismos', (r) => n(r.baptisms)],
    ['Vendas', (r) => kz(r.sales)],
    ...(withSite ? [['No site', (r) => kz(r.site)]] : []),
    ['Comissão', (r) => kz(r.totalCommission ?? r.commission)],
  ];
  const line = (r, total = false) => `<tr${total ? ' class="tot"' : ''}><td>${esc(total ? 'Total' : r.label)}</td>${cols.map(([, f]) => `<td class="n">${esc(f(r, total))}</td>`).join('')}</tr>`;
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(period)}</title><style>${estiloBaseImpressao()}
${STYLE}
@page{size:A4 landscape}body{font-size:12px}th,td{padding:5px 4px}</style></head><body>
  <h1>${esc(title)} · ${esc(period)}</h1>
  <p class="muted">${esc(brandName)} · ${esc(groupLabel)} · impresso a ${new Date().toLocaleString('pt-AO')}</p>
  <table><thead><tr><th>${esc(groupLabel)}</th>${cols.map(([h]) => `<th class="n">${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => line(r)).join('')}${line(totals, true)}</tbody></table>
  ${notes.map((t) => `<p class="muted" style="margin-top:8px">${esc(t)}</p>`).join('')}
  <div class="sig"><div>Pela Livraria</div><div>Director de Publicações</div></div>
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

/** O QR de um endereço, em SVG (para o cartão). */
export function qrSvg(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(String(texto || ''));
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

const CARD_STYLE = `@page{size:auto;margin:12mm}
body{margin:0;padding:12mm;color:#10233F;background:#fff}
.par{display:flex;flex-wrap:wrap;gap:8mm}
.card{width:85.6mm;height:54mm;border-radius:3.2mm;box-sizing:border-box;position:relative;overflow:hidden;border:0.3mm solid #C9D2DE;page-break-inside:avoid}
.frente{background:linear-gradient(135deg,#FFFFFF 0%,#F2F5F9 62%,#E4ECF5 100%)}
.frente .faixa{position:absolute;left:0;right:0;bottom:0;height:7mm;background:#10233F;color:#F2B705;font-size:2.1mm;font-weight:800;letter-spacing:.08em;white-space:nowrap;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;padding:0 4mm}
.frente .faixa span:last-child{color:#fff;letter-spacing:.04em}
.logo{position:absolute;left:4mm;top:3.2mm;height:7.5mm}
.foto{position:absolute;left:4mm;top:13mm;width:19mm;height:24mm;border:0.3mm dashed #9AA8BC;border-radius:1.5mm;display:grid;place-items:center;font-size:2.2mm;color:#7A8798;text-align:center;background:#fff}
.dados{position:absolute;left:26.5mm;top:12.5mm;right:4mm}
.dados .lab{font-size:1.9mm;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5E6A75;margin:0}
.dados .nome{font-family:${FONTE_TITULOS};font-size:4.2mm;font-weight:700;line-height:1.1;margin:.4mm 0 1.6mm}
.dados .linha{font-size:2.5mm;margin:0 0 1.2mm;line-height:1.25}
.dados .cod{font-size:3.6mm;font-weight:800;letter-spacing:.04em;color:#10233F}
.cat{display:inline-block;font-size:2.2mm;font-weight:800;padding:.5mm 1.8mm;border-radius:2mm;background:#E0679A;color:#fff;margin-left:1.5mm;vertical-align:.3mm}
.verso{background:#10233F;color:#E9EEF5}
.verso .qr{position:absolute;right:4mm;top:4mm;width:24mm;height:24mm;background:#fff;padding:1.4mm;border-radius:1.5mm}
.verso .qr svg{width:100%;height:100%;display:block}
.verso .txt{position:absolute;left:4mm;top:4mm;right:32.5mm;font-size:2.3mm;line-height:1.35;overflow-wrap:anywhere}
.verso .txt b{color:#F2B705}
.verso .chk{position:absolute;left:4mm;bottom:9mm;font-size:2.2mm;color:#AEB9C7}
.verso .chk b{display:block;font-size:4.4mm;letter-spacing:.14em;color:#fff;font-family:ui-monospace,monospace;margin-top:.6mm}
.verso .val{position:absolute;right:4mm;bottom:9mm;text-align:right;font-size:2.2mm;color:#AEB9C7}
.verso .val b{display:block;font-size:3.2mm;color:#fff;margin-top:.6mm}
.verso .ass{position:absolute;left:4mm;right:4mm;bottom:3mm;border-top:0.2mm solid #4A5F7D;padding-top:.8mm;font-size:1.9mm;color:#AEB9C7}
.nota{margin-top:6mm;font-size:3mm;color:#5E6A75;max-width:180mm}
@media print{body{padding:0}.nota{display:none}}`;

/**
 * O cartão de identificação do colportor (frente e verso, tamanho de cartão bancário, 85,6 × 54 mm),
 * para imprimir e plastificar. `card` vem de colporteur_card(); `verifyUrl` vai no QR.
 */
export function cardHtml(card, { verifyUrl, logoUrl = '/logo.png', brandName = 'Livraria e Editora Adventista' }) {
  const validade = card.valid_until ? new Date(card.valid_until + 'T12:00:00').toLocaleDateString('pt-AO') : '—';
  const igreja = [card.church || card.church_other, card.district, card.field].filter(Boolean).map(esc).join(' · ');
  const chk = String(card.card_check || '').replace(/(.{4})(.{4})/, '$1-$2');
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Cartão ${esc(card.code)}</title>
<style>${estiloBaseImpressao()}
${CARD_STYLE}</style></head><body>
<div class="par">
  <div class="card frente">
    <img class="logo" src="${esc(logoUrl)}" alt="">
    <div class="foto">Fotografia<br>tipo passe</div>
    <div class="dados">
      <p class="lab">Colportor</p>
      <p class="nome">${esc(card.full_name)}</p>
      <p class="linha"><span class="cod">${esc(card.code)}</span><span class="cat">${esc(CATEGORIES[card.category]?.label || card.category)}</span></p>
      <p class="linha">${igreja || '&nbsp;'}</p>
      ${card.store || card.province ? `<p class="linha">${esc([card.store, card.province].filter(Boolean).join(' · '))}</p>` : ''}
    </div>
    <div class="faixa"><span>Evangelismo pela literatura</span><span>Válido até ${esc(validade)}</span></div>
  </div>
  <div class="card verso">
    <div class="txt">Este cartão identifica um colportor da <b>${esc(brandName)}</b>. Para confirmar que é válido, aponte a câmara ao código ou abra <b>${esc(String(verifyUrl).replace(/^https?:\/\//, '').replace(/\/verificar\/.*$/, '/verificar'))}</b> e escreva os dois códigos do cartão.</div>
    <div class="qr">${qrSvg(verifyUrl)}</div>
    <div class="chk">Código de verificação<b>${esc(chk)}</b></div>
    <div class="val">Válido até<b>${esc(validade)}</b></div>
    <div class="ass">Assinatura do colportor</div>
  </div>
</div>
<p class="nota">Imprima em papel de 200 g ou mais, recorte pelo contorno e plastifique. Se o cartão se perder, a equipa reemite-o no painel (Colportagem → ficha → Cartão): o código de verificação muda e o cartão antigo deixa de ser válido.</p>
</body></html>`;
}
