// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Os interessados que os colportores escrevem nos relatórios semanais (nome, telefone, bairro e
 * pedido), juntos por distrito e com o pastor do distrito, para a equipa os encaminhar.
 * Código puro, testado em colporteurInterests.test.js.
 */
import { weekLabel } from '@/lib/colporteurReports';
import { whatsappLink } from '@/lib/stores';

/** Contam os relatórios enviados e os validados (um rascunho ainda não foi entregue). */
export const INTEREST_STATUSES = ['enviado', 'validado'];

/** No máximo tantos contactos numa mensagem de WhatsApp; os outros vão na lista impressa. */
export const MESSAGE_LIMIT = 40;

/** «923 456 789» (só se forem os 9 algarismos de um telemóvel de Angola). */
export function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return /^9\d{8}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

/** O link para ligar (tel:), com o indicativo de Angola se o número não o traz. */
export function telHref(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  return `tel:+${d.startsWith('244') ? d : `244${d.replace(/^0/, '')}`}`;
}

/** O pastor do distrito: o titular; sem titular, o primeiro associado; sem nenhum, null. */
export function districtPastor(idx, districtId) {
  if (!districtId) return null;
  const a = idx.titularOf.get(districtId) || (idx.associatesOf.get(districtId) || [])[0];
  const p = a && idx.pastors.get(a.pastor_id);
  if (!p) return null;
  return { id: p.id, label: idx.pastorLabel(p.id), phone: String(p.phone || '').replace(/\D/g, ''), titular: a.kind === 'titular' };
}

/**
 * Os interessados dos relatórios enviados e validados das semanas que começam entre `from` e `to`
 * (YYYY-MM-DD, opcionais), com o colportor, a igreja e o distrito (o da igreja do colportor).
 * A mesma pessoa (o mesmo telefone ou, sem telefone, o mesmo nome) no mesmo distrito conta uma
 * vez: fica a do relatório mais recente, com `times` a dizer em quantos apareceu.
 */
export function interestRows({ reports, colporteurs, idx, from = '', to = '' }) {
  const byId = new Map(colporteurs.map((c) => [c.id, c]));
  const seen = new Map();
  const inPeriod = (r) => INTEREST_STATUSES.includes(r.status)
    && (!from || String(r.week_start) >= from) && (!to || String(r.week_start) <= to);
  const recentFirst = reports.filter(inPeriod).sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
  for (const r of recentFirst) {
    const c = byId.get(r.colporteur_id);
    const church = c?.church_id ? idx.churchesById.get(c.church_id) : null;
    const districtId = church?.district_id || '';
    (r.interest_contacts || []).forEach((p, i) => {
      const name = String(p?.name || '').trim();
      if (!name) return;
      const phone = String(p.phone || '').replace(/\D/g, '');
      const who = `${districtId}|${phone || name.toLowerCase()}`;
      const prev = seen.get(who);
      if (prev) { prev.times += 1; return; }
      seen.set(who, {
        key: `${r.id}:${i}`,
        name,
        phone,
        place: String(p.place || '').trim(),
        request: String(p.request || '').trim(),
        weekStart: String(r.week_start),
        status: r.status,
        times: 1,
        colporteur: c ? { id: c.id, code: c.code || '', name: c.full_name || '' } : null,
        churchLabel: church?.name || (c?.church_other ? `${c.church_other} (fora do registo)` : ''),
        districtId,
      });
    });
  }
  return [...seen.values()];
}

/**
 * Os interessados por distrito, cada grupo com o nome do distrito, a província e o pastor. Os
 * distritos pela ordem do nome; os sem distrito (colportor sem igreja no registo) no fim.
 */
export function groupByDistrict(rows, idx) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.districtId)) {
      const d = idx.districts.get(row.districtId);
      const province = d ? idx.provinceName(d.province_id) : '';
      groups.set(row.districtId, {
        districtId: row.districtId,
        label: row.districtId ? `${idx.districtName(row.districtId) || 'Distrito'}${province ? ` · ${province}` : ''}` : 'Sem distrito',
        pastor: districtPastor(idx, row.districtId),
        rows: [],
      });
    }
    groups.get(row.districtId).rows.push(row);
  }
  const out = [...groups.values()];
  for (const g of out) g.rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.name.localeCompare(b.name, 'pt'));
  return out.sort((a, b) => (!a.districtId) - (!b.districtId) || a.label.localeCompare(b.label, 'pt'));
}

/** Uma linha de um interessado, para a mensagem e para copiar. */
export function interestLine(row) {
  return [
    row.name,
    row.phone ? formatPhone(row.phone) : '',
    row.place,
    row.request,
  ].filter(Boolean).join(' — ') + (row.colporteur || row.churchLabel
    ? ` (${[row.colporteur ? `${row.colporteur.code} ${row.colporteur.name}`.trim() : '', row.churchLabel].filter(Boolean).join(', ')}; semana de ${weekLabel(row.weekStart)})`
    : ` (semana de ${weekLabel(row.weekStart)})`);
}

/** A mensagem para o pastor do distrito: quem visitar, com os contactos. */
export function pastorMessage(group, periodLabel) {
  const shown = group.rows.slice(0, MESSAGE_LIMIT);
  const extra = group.rows.length - shown.length;
  return [
    `Olá${group.pastor ? `, ${group.pastor.label}` : ''}.`,
    `Os colportores da Livraria Adventista encontraram ${group.rows.length === 1 ? 'esta pessoa interessada' : `estas ${group.rows.length} pessoas interessadas`} no ${group.districtId ? `distrito ${group.label}` : 'vosso campo'} (${periodLabel}):`,
    '',
    ...shown.map((r, i) => `${i + 1}. ${interestLine(r)}`),
    ...(extra > 0 ? ['', `E mais ${extra}: peça à Livraria a lista completa.`] : []),
    '',
    'Pedimos que alguém da igreja as contacte e visite. Obrigado!',
    'Livraria Adventista · Colportagem',
  ].join('\n');
}

/** O link do WhatsApp para o pastor, com a mensagem; '' se o pastor não tem telefone. */
export function pastorWhatsApp(group, periodLabel) {
  return group.pastor?.phone ? whatsappLink(group.pastor.phone, pastorMessage(group, periodLabel)) : '';
}
