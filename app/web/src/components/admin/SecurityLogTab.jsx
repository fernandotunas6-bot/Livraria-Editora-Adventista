import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { BellRing, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { isMissingTable } from '@/lib/communityApi';
import { AREAS, actorLabel, areaLabel, changeRows, filterRows } from '@/lib/securityLog';

const LIMIT = 300;

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * Painel → Registo de segurança (só administradores).
 *
 * Quem mudou dados de pagamento, contactos, permissões, segredos, preços ou o pagamento de uma
 * encomenda, com o antes e o depois. A base de dados escreve cada linha por gatilho e recusa
 * alterar ou apagar o que lá está (migração 20261107130000_registo_de_seguranca); o que pede
 * reacção já também chega aos administradores por email e push.
 */
export default function SecurityLogTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [area, setArea] = useState('');
  const [alertedOnly, setAlertedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const areaId = useId();
  const queryId = useId();
  const alertedId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('security_audit_log')
        .select('id, at, actor_email, actor_kind, table_name, row_id, action, summary, changes, alerted')
        .order('at', { ascending: false })
        .limit(LIMIT);
      if (err) throw err;
      setRows(data || []);
      setMissing(false);
    } catch (e) {
      if (isMissingTable(e)) setMissing(true);
      else setError(e.message || 'Não foi possível carregar o registo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => filterRows(rows, { area, alertedOnly, query }), [rows, area, alertedOnly, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /> Registo de segurança
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada alteração a dados de pagamento, contactos da loja, permissões da equipa, segredos, preços e
            pagamentos de encomendas fica aqui, com quem a fez e o valor antes e depois. Ninguém consegue
            apagar nem alterar estas linhas. As marcadas com <BellRing className="inline h-3.5 w-3.5" aria-label="aviso" /> foram
            avisadas por email e push aos administradores.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Se vir uma alteração que ninguém da equipa fez: mude a palavra-passe dessa conta, active a verificação em
            dois passos, termine as sessões dela em Utilizadores e reponha o valor anterior.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor={areaId} className="text-xs font-medium text-muted-foreground">Área</label>
          <select
            id={areaId}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(AREAS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1">
          <label htmlFor={queryId} className="text-xs font-medium text-muted-foreground">Procurar</label>
          <Input id={queryId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Email, encomenda, IBAN…" />
        </div>
        <label htmlFor={alertedId} className="flex h-9 items-center gap-2 text-sm">
          <input id={alertedId} type="checkbox" checked={alertedOnly} onChange={(e) => setAlertedOnly(e.target.checked)} className="h-4 w-4" />
          Só as que geraram aviso
        </label>
      </div>

      {missing && (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm">
          O registo de segurança ainda não está activo nesta base de dados: falta aplicar a migração
          <code className="mx-1">20261107130000_registo_de_seguranca</code>.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

      {loading && !rows.length ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="A carregar" /></div>
      ) : !missing && !error && (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {shown.length} de {rows.length} {rows.length === 1 ? 'alteração' : 'alterações'}
            {rows.length >= LIMIT ? ` (as ${LIMIT} mais recentes)` : ''}
          </p>
          {shown.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              {rows.length ? 'Nada corresponde aos filtros.' : 'Ainda não há alterações registadas.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {shown.map((row) => {
                const changes = changeRows(row.changes);
                return (
                  <li key={row.id} className={`rounded-xl border bg-card p-3 ${row.alerted ? 'border-amber-400/70' : ''}`}>
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      {row.alerted && <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Avisado aos administradores" />}
                      <p className="min-w-0 flex-1 break-words font-medium">{row.summary}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{when(row.at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {areaLabel(row.table_name)} · por <span className="font-medium text-foreground">{actorLabel(row)}</span>
                    </p>
                    {changes.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs font-medium text-primary">
                          Ver o que mudou ({changes.length} {changes.length === 1 ? 'campo' : 'campos'})
                        </summary>
                        <dl className="mt-2 space-y-1.5">
                          {changes.map((c) => (
                            <div key={c.field} className="grid gap-1 rounded-lg bg-muted/40 p-2 sm:grid-cols-[160px_1fr]">
                              <dt className="text-xs font-medium text-muted-foreground">{c.label}</dt>
                              <dd className="min-w-0 break-words text-xs">
                                <span className="line-through opacity-70">{c.from}</span>
                                <span aria-hidden="true"> → </span>
                                <span className="sr-only"> passou a </span>
                                <span className="font-medium">{c.to}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
