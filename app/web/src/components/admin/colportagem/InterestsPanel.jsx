// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useMemo, useState } from 'react';
import { Copy, Download, MessageCircle, Phone, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeChip } from '@/components/admin/users/userFormat';
import { useToast } from '@/hooks/use-toast';
import { downloadCsv, matchesQuery } from '@/lib/churchRegistryApi';
import { formatPhone, groupByDistrict, interestRows, pastorMessage, pastorWhatsApp, telHref } from '@/lib/colporteurInterests';
import { interestsHtml, openPrint } from '@/lib/colporteurPrint';
import { REPORT_STATUSES, monthLabel, monthWeeks, recentWeeks, reportMonths, weekLabel } from '@/lib/colporteurReports';
import { DataTable, NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';

const KINDS = { recentes: 'Últimas 4 semanas', mes: 'Um mês', tudo: 'Desde o início' };

/** As semanas do período: as últimas 4 (com a corrente), as de um mês, ou todas. */
export function interestPeriod(kind, month, today = new Date().toISOString().slice(0, 10)) {
  if (kind === 'mes') {
    const weeks = monthWeeks(month);
    return { key: month, label: monthLabel(month), from: weeks[0], to: weeks.at(-1) };
  }
  if (kind === 'tudo') return { key: 'tudo', label: 'desde o início', from: '', to: '' };
  const weeks = recentWeeks(4, today);
  return { key: `recentes-${weeks[0]}`, label: `semanas de ${weekLabel(weeks.at(-1)).slice(0, 5)} a ${weekLabel(weeks[0]).slice(-5)}`, from: weeks.at(-1), to: weeks[0] };
}

/**
 * Interessados para os pastores: as pessoas que os colportores escrevem nos relatórios (estudos
 * bíblicos, visita, oração), por distrito, com o pastor do distrito, para lhas enviar por
 * WhatsApp, copiar ou imprimir.
 */
export default function InterestsPanel({ data, ops, idx }) {
  const { toast } = useToast();
  const [kind, setKind] = useState('recentes');
  const months = useMemo(() => reportMonths({ reports: ops.reports, colporteurs: data.colporteurs }), [ops.reports, data.colporteurs]);
  const [month, setMonth] = useState(() => months[0]);
  const [district, setDistrict] = useState('all');
  const [query, setQuery] = useState('');
  const period = useMemo(() => interestPeriod(kind, month), [kind, month]);

  const all = useMemo(() => groupByDistrict(interestRows({ reports: ops.reports, colporteurs: data.colporteurs, idx, from: period.from, to: period.to }), idx),
    [ops.reports, data.colporteurs, idx, period.from, period.to]);
  const groups = useMemo(() => all
    .filter((g) => district === 'all' || g.districtId === district)
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !query || matchesQuery(`${r.name} ${r.phone} ${r.place} ${r.request} ${r.churchLabel} ${r.colporteur?.name || ''}`, query)) }))
    .filter((g) => g.rows.length), [all, district, query]);
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const toValidate = groups.reduce((s, g) => s + g.rows.filter((r) => r.status === 'enviado').length, 0);
  const noPastor = groups.filter((g) => g.districtId && !g.pastor).length;

  const print = (list) => {
    const html = interestsHtml({ groups: list, period: period.label, formatPhone, weekLabel });
    if (!openPrint(html)) toast({ variant: 'destructive', title: 'Não foi possível abrir a lista', description: 'O browser bloqueou a janela de impressão. Permita janelas pop-up para este site.' });
  };
  const copy = async (g) => {
    try {
      await navigator.clipboard.writeText(pastorMessage(g, period.label));
      toast({ title: 'Texto copiado.', description: 'Cole-o numa mensagem para o pastor.' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: 'O browser não deu acesso à área de transferência.' });
    }
  };
  const exportCsv = () => downloadCsv(`interessados-colportagem-${period.key}`,
    ['Distrito', 'Pastor', 'Telefone do pastor', 'Nome', 'Telefone', 'Bairro / local', 'Pedido', 'Colportor', 'Igreja', 'Semana', 'Estado do relatório', 'Relatórios'],
    groups.flatMap((g) => g.rows.map((r) => [g.label, g.pastor?.label || '', g.pastor?.phone || '', r.name, r.phone, r.place, r.request,
      r.colporteur ? `${r.colporteur.code} ${r.colporteur.name}` : '', r.churchLabel, weekLabel(r.weekStart), REPORT_STATUSES[r.status]?.label || r.status, r.times])));

  return (
    <div className="space-y-6">
      <Toolbar>
        <NativeSelect value={kind} onChange={setKind} className="w-auto" aria-label="Período">
          {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
        {kind === 'mes' && (
          <NativeSelect value={month} onChange={setMonth} className="w-auto" aria-label="Mês">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </NativeSelect>
        )}
        <NativeSelect value={district} onChange={setDistrict} className="w-auto" aria-label="Distrito">
          <option value="all">Todos os distritos</option>
          {all.map((g) => <option key={g.districtId || 'sem'} value={g.districtId}>{g.label} ({g.rows.length})</option>)}
        </NativeSelect>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar nome, telefone, bairro…" className="pl-8" aria-label="Procurar" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!total} onClick={() => print(groups)}><Printer className="mr-1.5 h-4 w-4" />Imprimir</Button>
          <Button variant="outline" size="sm" disabled={!total} onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
        </div>
      </Toolbar>

      <p className="text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">{total}</strong> {total === 1 ? 'interessado' : 'interessados'} em <strong className="font-semibold text-foreground">{groups.length}</strong> {groups.length === 1 ? 'distrito' : 'distritos'}, {period.label}.
        {' '}Contam os relatórios enviados e os validados; a mesma pessoa em vários relatórios aparece uma vez.
        {toValidate > 0 && ` ${toValidate} ${toValidate === 1 ? 'vem de um relatório' : 'vêm de relatórios'} ainda por validar.`}
      </p>
      {noPastor > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          {noPastor === 1 ? 'Um distrito não tem' : `${noPastor} distritos não têm`} pastor no registo. Atribua-o em Registo da Igreja → Distritos para poder enviar a lista por WhatsApp.
        </p>
      )}

      {!groups.length && (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          {all.length ? 'Nenhum interessado com estes filtros.' : 'Ainda não há interessados neste período. Os colportores escrevem-nos no relatório semanal, em «Interessados».'}
        </p>
      )}

      {groups.map((g) => {
        const wa = pastorWhatsApp(g, period.label);
        return (
          <section key={g.districtId || 'sem'} className="rounded-2xl border border-border p-4" aria-label={`Interessados · ${g.label}`}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{g.label} <span className="text-sm font-normal text-muted-foreground">· {g.rows.length} {g.rows.length === 1 ? 'pessoa' : 'pessoas'}</span></h3>
                <p className="text-sm text-muted-foreground">
                  {g.pastor
                    ? <>Pastor: <span className="text-foreground">{g.pastor.label}</span>{!g.pastor.titular && ' (associado)'}{g.pastor.phone ? <> · <a className="underline-offset-2 hover:underline" href={telHref(g.pastor.phone)}>{formatPhone(g.pastor.phone)}</a></> : ' · sem telefone no registo'}</>
                    : g.districtId ? 'Sem pastor no registo.' : 'Colportores sem igreja no registo: ligue-os a uma igreja na ficha para saber o distrito.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {wa
                  ? <Button size="sm" asChild><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />Enviar ao pastor</a></Button>
                  : <Button size="sm" disabled title="O pastor não tem telefone no registo"><MessageCircle className="mr-1.5 h-4 w-4" />Enviar ao pastor</Button>}
                <Button size="sm" variant="outline" onClick={() => copy(g)}><Copy className="mr-1.5 h-4 w-4" />Copiar texto</Button>
                <Button size="sm" variant="outline" onClick={() => print([g])}><Printer className="mr-1.5 h-4 w-4" />Imprimir</Button>
              </div>
            </div>
            <DataTable count={g.rows.length} head={['Nome', 'Telefone', 'Bairro / local', 'Pedido', 'Colportor', 'Igreja', 'Semana']}>
              {g.rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-2 font-medium">{r.name}{r.times > 1 && <span className="ml-1 text-xs text-muted-foreground">({r.times} relatórios)</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.phone ? <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={telHref(r.phone)}><Phone className="h-3.5 w-3.5" />{formatPhone(r.phone)}</a> : '—'}</td>
                  <td className="px-3 py-2">{r.place || '—'}</td>
                  <td className="px-3 py-2">{r.request || '—'}</td>
                  <td className="px-3 py-2">{r.colporteur ? <><CodeChip code={r.colporteur.code} /> {r.colporteur.name}</> : '—'}</td>
                  <td className="px-3 py-2">{r.churchLabel || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{weekLabel(r.weekStart)}{r.status === 'enviado' && <> <Pill tone="amber">por validar</Pill></>}</td>
                </tr>
              ))}
            </DataTable>
          </section>
        );
      })}
    </div>
  );
}
