// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CreditCard, Loader2, LockOpen, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  STATE_ORDER, TONE_CLASS, blockDigitalAccess, countByState, digitalState, downloadsLabel, loadDigitalAccess, unblockDigitalAccess,
} from '@/lib/digitalLibrary';
import { kwanza } from '@/lib/money';
import { cn } from '@/lib/utils';

const dateOnly = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-AO');
};

/** O pagamento da encomenda, em palavras simples. */
function paymentLine(row) {
  const total = Number(row.total) || 0;
  const paid = Number(row.amount_paid) || 0;
  if (row.payment_status === 'paid') return `Paga · ${kwanza(paid || total)}`;
  if (row.payment_status === 'refunded') return 'Reembolsada';
  if (paid > 0) return `Pago ${kwanza(paid)} de ${kwanza(total)}`;
  if (row.payment_status === 'awaiting_confirmation') return `Cliente indicou o pagamento · ${kwanza(total)}`;
  return `Por pagar · ${kwanza(total)}`;
}

/**
 * Painel → Catálogo → Materiais → Acessos e pagamentos.
 *
 * Quem comprou cada livro digital, o pagamento da encomenda e o acesso. Abrir não é um botão à
 * parte: o livro abre sozinho quando o pagamento é confirmado (pelo gateway ou por quem tem
 * "Confirmar pagamentos", em Encomendas) e fecha com o reembolso. Aqui a equipa vê o que falta,
 * vai à encomenda confirmar o pagamento, e bloqueia ou desbloqueia um acesso (fica no registo de
 * segurança). Regras: migração 20261108160000_livros_digitais.
 */
export default function DigitalAccessPanel() {
  const { toast } = useToast();
  const { isAdmin, hasPermission } = useAuth();
  const canOpenOrders = isAdmin || hasPermission('manage_orders');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [blockFor, setBlockFor] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: list, missing: noTable } = await loadDigitalAccess({ search: query });
      setRows(list);
      setMissing(noTable);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível carregar', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => { load(); }, [load]);

  // A procura vai ao servidor meio segundo depois de parar de escrever.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 450);
    return () => clearTimeout(t);
  }, [search]);

  const counts = useMemo(() => countByState(rows), [rows]);
  const shown = filter ? rows.filter((r) => r.state === filter) : rows;

  const doBlock = async () => {
    const row = blockFor;
    setBusy(`${row.download_id}:${row.customer_id}`);
    try {
      await blockDigitalAccess({ downloadId: row.download_id, userId: row.customer_id, reason });
      toast({ title: 'Acesso bloqueado', description: `${row.title} — ${row.customer_email || row.customer_name}` });
      setBlockFor(null);
      setReason('');
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível bloquear', description: e.message });
    } finally {
      setBusy('');
    }
  };

  const doUnblock = async (row) => {
    setBusy(`${row.download_id}:${row.customer_id}`);
    try {
      await unblockDigitalAccess({ downloadId: row.download_id, userId: row.customer_id });
      toast({ title: 'Acesso desbloqueado', description: 'Volta a abrir, porque a encomenda está paga.' });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível desbloquear', description: e.message });
    } finally {
      setBusy('');
    }
  };

  if (missing) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Os acessos aos livros digitais precisam da migração <code>20261108160000_livros_digitais</code>, aplicada na próxima publicação da base de dados.
      </p>
    );
  }

  const chips = [{ id: '', label: 'Todos', count: rows.length }, ...STATE_ORDER
    .filter((k) => counts[k] > 0)
    .map((k) => ({ id: k, label: digitalState(k).staffLabel, count: counts[k], tone: digitalState(k).tone }))];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
        Um livro digital <strong className="text-foreground">abre sozinho quando o pagamento da encomenda é confirmado</strong> — pelo gateway
        ou por quem tem «Confirmar pagamentos», em Encomendas — e fecha com o reembolso ou o cancelamento. O cliente abre-o em
        Perfil → Biblioteca.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar por cliente, email, código, encomenda ou livro"
            className="pl-9"
            aria-label="Procurar nos acessos"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} aria-hidden="true" /> Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pelo estado do acesso">
        {chips.map((c) => (
          <button
            key={c.id || 'todos'}
            type="button"
            onClick={() => setFilter(c.id)}
            aria-pressed={filter === c.id}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === c.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
            )}
          >
            {c.label} <span className="tabular-nums opacity-80">{c.count}</span>
          </button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="A carregar" /></div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Ainda ninguém comprou livros digitais. Aparecem aqui as encomendas com produtos ou edições ligados a um material pago.'
            : 'Nenhum acesso neste estado.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => {
            const st = digitalState(row.state);
            const key = `${row.download_id}:${row.order_id}`;
            const working = busy === `${row.download_id}:${row.customer_id}`;
            const orderHref = `/admin?tab=orders&encomenda=${encodeURIComponent(row.order_number || '')}`;
            return (
              <li key={key} className="rounded-xl border bg-card p-3" data-acesso={row.state}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', TONE_CLASS[st.tone])}>{st.staffLabel}</span>
                    <p className="font-medium text-foreground">{row.title}</p>
                  </div>
                  <div className="mt-0.5">
                    <p className="text-sm text-foreground/90">
                      {row.customer_name || 'Cliente'}
                      <span className="text-muted-foreground"> · {row.customer_email || 'sem email'}{row.customer_code ? ` · ${row.customer_code}` : ''}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Encomenda {row.order_number || '—'} · {dateOnly(row.ordered_at)} · {paymentLine(row)}
                      {row.state === 'open' || row.state === 'blocked' ? ` · ${downloadsLabel(row.downloads, row.last_download)}` : ''}
                    </p>
                    {row.state === 'blocked' && row.block_reason && (
                      <p className="mt-1 text-xs text-destructive">Bloqueado a {dateOnly(row.blocked_at)}: {row.block_reason}</p>
                    )}
                    {row.state === 'no_account' && <p className="mt-1 text-xs text-muted-foreground">{st.hint}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['payment_review', 'awaiting_payment', 'partially_paid'].includes(row.state) && (canOpenOrders ? (
                    <Button size="sm" variant={row.state === 'payment_review' ? 'default' : 'outline'} asChild>
                      <Link to={orderHref}>
                        <CreditCard className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {row.state === 'payment_review' ? 'Confirmar o pagamento' : 'Ver a encomenda'}
                      </Link>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Quem tem «Confirmar pagamentos» confirma-o em Encomendas.</p>
                  ))}
                  {row.state === 'open' && row.customer_id && (
                    <Button size="sm" variant="outline" disabled={working} onClick={() => { setBlockFor(row); setReason(''); }}>
                      <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" /> Bloquear
                    </Button>
                  )}
                  {row.state === 'blocked' && row.customer_id && (
                    <Button size="sm" variant="outline" disabled={working} onClick={() => doUnblock(row)}>
                      {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                      Desbloquear
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!blockFor} onOpenChange={(open) => { if (!open) setBlockFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bloquear o acesso?</DialogTitle>
            <DialogDescription>
              {blockFor?.customer_name || blockFor?.customer_email} deixa de abrir «{blockFor?.title}», mesmo com a encomenda paga. Fica no registo de segurança.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bloqueio-motivo">Motivo</Label>
            <Textarea
              id="bloqueio-motivo" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: Partilhou o ficheiro num grupo de WhatsApp."
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockFor(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={doBlock} disabled={reason.trim().length < 3 || !!busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />} Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
