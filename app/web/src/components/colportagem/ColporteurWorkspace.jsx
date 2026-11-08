import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ClipboardList, Copy, Globe, Loader2, MessageCircle, Printer, Scale, Send, Truck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { loadBooksForColportage, loadMyOperations, saveReport } from '@/lib/colporteurApi';
import { kz } from '@/lib/colporteurCommission';
import { LEDGER_KINDS, REPORT_STATUSES, ledgerWithBalance, recentWeeks, weekLabel } from '@/lib/colporteurReports';
import { documentHtml, openPrint, statementHtml } from '@/lib/colporteurPrint';
import { referralLink } from '@/lib/colporteurReferral';
import { getDeliveryStatusLabel, getPaymentStatusLabel } from '@/lib/orderUtils';
import { Pill } from '@/components/admin/igreja/registryUi';
import ReportForm, { EMPTY_REPORT, reportPayload, reportToForm } from './ReportForm';
import ColporteurDeliveries from './ColporteurDeliveries';

const DRAFT_KEY = (id) => `livraria_colportor_rascunho_${id}`;
const readDraft = (id) => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY(id)) || 'null'); } catch { return null; } };
const writeDraft = (id, v) => { try { localStorage.setItem(DRAFT_KEY(id), JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const clearDraft = (id) => { try { localStorage.removeItem(DRAFT_KEY(id)); } catch { /* idem */ } };

/** A semana a preencher: a mais antiga das três últimas ainda sem relatório enviado. */
export function pickWeek(reports, weeks) {
  const of = (w) => reports.find((r) => r.week_start === w);
  return weeks.slice(0, 3).reverse().find((w) => !of(w) || ['rascunho', 'devolvido'].includes(of(w).status)) || weeks[0];
}

/**
 * O trabalho do colportor na sua área: livros que tem à consignação, o relatório semanal (com
 * rascunho guardado no telemóvel e na base de dados), os relatórios enviados e a conta corrente.
 */
export default function ColporteurWorkspace({ me }) {
  // Os avisos de entrega abrem /colportor?tab=entregas.
  const [params] = useSearchParams();
  const startTab = ['relatorio', 'entregas', 'livros', 'historico', 'site', 'conta'].includes(params.get('tab')) ? params.get('tab') : 'relatorio';
  const { toast } = useToast();
  const [ops, setOps] = useState(null);
  const [books, setBooks] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const weeks = useMemo(() => recentWeeks(6), []);

  const load = useCallback(async () => {
    try {
      const [o, b] = await Promise.all([loadMyOperations(), loadBooksForColportage()]);
      setOps(o);
      setBooks(b);
      setError('');
      return o;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    load().then((o) => {
      if (!o) return;
      const local = readDraft(me.id);
      const status = (w) => o.reports.find((r) => r.week_start === w)?.status;
      if (local?.week_start && !['enviado', 'validado'].includes(status(local.week_start))) {
        setForm(local);
        return;
      }
      const target = pickWeek(o.reports, weeks);
      const existing = o.reports.find((r) => r.week_start === target);
      setForm(existing ? reportToForm(existing) : { ...EMPTY_REPORT, week_start: target });
    });
  }, [load, me.id, weeks]);

  const change = (v) => {
    // Mudar de semana carrega o que já existe dessa semana.
    if (form && v.week_start !== form.week_start) {
      const existing = ops?.reports.find((r) => r.week_start === v.week_start);
      const next = existing ? reportToForm(existing) : { ...EMPTY_REPORT, week_start: v.week_start };
      setForm(next);
      writeDraft(me.id, next);
      return;
    }
    setForm(v);
    writeDraft(me.id, v);
  };

  const submit = async (send) => {
    setBusy(true);
    try {
      await saveReport(reportPayload(form), send);
      if (send) clearDraft(me.id);
      toast({ title: send ? 'Relatório enviado. A equipa vai validá-lo.' : 'Rascunho guardado.' });
      await load();
    } catch (err) {
      toast({ title: 'Não foi possível', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{error}</p>;
  if (!ops || !form) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const ov = ops.overview || { balance: 0, in_hand: [], in_hand_value: 0, year_hours: 0, year_sales: 0, year_commission: 0 };
  const current = ops.reports.find((r) => r.week_start === form.week_start);
  const locked = current && ['enviado', 'validado'].includes(current.status);
  const balance = Number(ov.balance || 0);
  const statement = ledgerWithBalance(ops.ledger).reverse();
  const link = me.code ? referralLink(me.code) : '';
  const siteSales = ov.site_sales || [];
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); toast({ title: 'Link copiado.' }); } catch { /* sem acesso à área de transferência */ }
  };
  const shareText = `Encomende livros da Livraria Adventista com o meu código de colportor ${me.code}: ${link}`;

  return (
    <div className="space-y-4">
      {link && (
        <div className="rounded-2xl border border-border p-4">
          <p className="mb-1 font-semibold">O seu link de vendas</p>
          <p className="mb-3 text-sm text-muted-foreground">Quem comprar no site por este link (ou escrever {me.code} no checkout) conta para si: ganha a sua percentagem quando a encomenda for paga e entregue.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-muted px-2 py-1 text-sm">{link}</code>
            <Button size="sm" variant="outline" onClick={copyLink}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button>
            <Button size="sm" asChild><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />Partilhar</a></Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['À consignação', kz(ov.in_hand_value)], [balance >= 0 ? 'Deve à Livraria' : 'A Livraria deve-lhe', kz(Math.abs(balance))], ['Horas este ano', Number(ov.year_hours || 0)], ['Comissão este ano', kz(ov.year_commission)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold tabular-nums">{v}</p></div>
        ))}
      </div>

      <Tabs defaultValue={startTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="relatorio"><Send className="mr-1.5 h-4 w-4" />Relatório</TabsTrigger>
          <TabsTrigger value="entregas"><Truck className="mr-1.5 h-4 w-4" />Entregas</TabsTrigger>
          <TabsTrigger value="livros"><BookOpen className="mr-1.5 h-4 w-4" />Livros ({ov.in_hand.reduce((s, b) => s + b.qty, 0)})</TabsTrigger>
          <TabsTrigger value="historico"><ClipboardList className="mr-1.5 h-4 w-4" />Relatórios</TabsTrigger>
          <TabsTrigger value="site"><Globe className="mr-1.5 h-4 w-4" />No site ({siteSales.length})</TabsTrigger>
          <TabsTrigger value="conta"><Scale className="mr-1.5 h-4 w-4" />Conta</TabsTrigger>
        </TabsList>

        <TabsContent value="relatorio" className="rounded-2xl border border-border p-4">
          {current?.status === 'devolvido' && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">A equipa devolveu este relatório: {current.return_reason}</p>}
          {locked ? (
            <div className="space-y-3">
              <p className="text-sm">O relatório da semana de {weekLabel(form.week_start)} está <Pill tone={REPORT_STATUSES[current.status].tone}>{REPORT_STATUSES[current.status].label.toLowerCase()}</Pill>.</p>
              <div className="flex flex-wrap gap-2">
                {weeks.filter((w) => w !== form.week_start).slice(0, 3).map((w) => (
                  <Button key={w} size="sm" variant="outline" onClick={() => change({ ...form, week_start: w })}>Semana de {weekLabel(w)}</Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <ReportForm value={form} onChange={change} inHand={ov.in_hand} books={books} weeks={weeks} />
              <div className="mt-6 flex flex-wrap gap-2">
                <Button disabled={busy || !form.week_start} onClick={() => submit(true)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar relatório</Button>
                <Button variant="outline" disabled={busy || !form.week_start} onClick={() => submit(false)}>Guardar rascunho</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">O que escreve fica guardado neste telemóvel enquanto não envia. Depois de enviado, só a equipa o pode devolver para corrigir.</p>
            </>
          )}
        </TabsContent>

        <TabsContent value="entregas" className="rounded-2xl border border-border p-4">
          <ColporteurDeliveries onChanged={load} />
        </TabsContent>

        <TabsContent value="livros" className="rounded-2xl border border-border p-4">
          {ov.in_hand.length === 0 ? <p className="text-sm text-muted-foreground">Não tem livros à consignação.</p> : (
            <ul className="divide-y divide-border text-sm">
              {ov.in_hand.map((b) => (
                <li key={b.book_id} className="flex justify-between gap-2 py-2">
                  <span><span className="font-medium">{b.title}</span><span className="block text-xs text-muted-foreground">{b.book_code} · {kz(b.unit_price)}</span></span>
                  <span className="font-bold tabular-nums">{b.qty}</span>
                </li>
              ))}
            </ul>
          )}
          {ops.documents.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 font-semibold">Guias</h4>
              <ul className="space-y-1 text-sm">
                {ops.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span>{d.number} · {new Date(d.created).toLocaleDateString('pt-AO')} · {kz(Math.abs(d.amount))}</span>
                    <Button size="sm" variant="ghost" aria-label="Imprimir guia" onClick={() => openPrint(documentHtml({ doc: d, colporteur: me }))}><Printer className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        <TabsContent value="historico" className="rounded-2xl border border-border p-4">
          {ops.reports.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não enviou relatórios.</p> : (
            <ul className="divide-y divide-border text-sm">
              {[...ops.reports].sort((a, b) => String(b.week_start).localeCompare(String(a.week_start))).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{weekLabel(r.week_start)} · {Number(r.hours)} h · {r.visits} visitas</span>
                  <span className="flex items-center gap-2">
                    {r.status === 'validado' && <span className="tabular-nums">{kz(r.commission_value)}</span>}
                    <Pill tone={REPORT_STATUSES[r.status].tone}>{REPORT_STATUSES[r.status].label}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="site" className="rounded-2xl border border-border p-4">
          {siteSales.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há encomendas no site com o seu código. Partilhe o link acima.</p> : (
            <ul className="divide-y divide-border text-sm">
              {siteSales.map((s) => (
                <li key={s.order_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{s.order_number}</span> · {new Date(s.created).toLocaleDateString('pt-AO')} · {kz(s.products_value)}
                    <span className="block text-xs text-muted-foreground">{getPaymentStatusLabel(s.payment_status)} · {getDeliveryStatusLabel(s.delivery_status)}</span>
                  </span>
                  <span className="tabular-nums">
                    {s.cancelled_commission ? <Pill tone="muted">anulada</Pill>
                      : Number(s.commission) > 0 ? <Pill tone="green">{kz(s.commission)}</Pill>
                        : Number(s.expected) > 0 ? <Pill tone="amber">prevista {kz(s.expected)}</Pill> : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="conta" className="rounded-2xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm">{balance > 0 ? `Deve ${kz(balance)} à Livraria (livros à consignação e vendas por pagar).` : balance < 0 ? `A Livraria deve-lhe ${kz(-balance)}.` : 'Contas certas.'}</p>
            <Button size="sm" variant="outline" onClick={() => openPrint(statementHtml({ colporteur: me, entries: ops.ledger, inHand: ov.in_hand }))}><Printer className="mr-1.5 h-4 w-4" />Extracto</Button>
          </div>
          <ul className="divide-y divide-border text-sm">
            {statement.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{e.entry_date} · {LEDGER_KINDS[e.kind]}{e.description ? ` · ${e.description}` : ''}</span>
                <span className="tabular-nums">{kz(e.amount)} <span className="text-muted-foreground">→ {kz(e.balance)}</span></span>
              </li>
            ))}
            {!statement.length && <li className="py-2 text-muted-foreground">Sem movimentos.</li>}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
