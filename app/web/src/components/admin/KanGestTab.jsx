import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Copy, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { kangestEstado, kangestRepetir, kangestSincronizar } from '@/api/PlatformApi';
import { cn } from '@/lib/utils';

const ACCOES = { ne: 'Nota de encomenda', fr: 'Factura/Recibo', anular: 'Anulação', nc: 'Nota de crédito' };
const FILA = [['pendente', 'Na fila', 'text-amber-600'], ['feito', 'Feitos', 'text-emerald-600'], ['erro', 'Com erro', 'text-red-600'], ['ignorado', 'Não vão', 'text-muted-foreground']];
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short' }) : '—');

function Passo({ feito, children }) {
  return (
    <li className="flex items-start gap-2">
      {feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={cn(!feito && 'text-muted-foreground')}>{children}</span>
    </li>
  );
}

/**
 * Ligação ao KanGest (docs/KANGEST.md): se está activa, as ligações e as lojas de cada uma, quantos livros estão
 * ligados por referência, a fila dos documentos (NE, FR, anulações, notas de crédito) e os erros — repetem-se daqui
 * depois de corrigidos —, e sincronizar já.
 */
export default function KanGestTab() {
  const [estado, setEstado] = useState(null);
  const [lojas, setLojas] = useState({});
  const [livros, setLivros] = useState(null);
  const [aSincronizar, setASincronizar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEstado(await kangestEstado());
    } catch (e) {
      toast.error(e?.message || 'Não foi possível ler o estado da ligação.');
    }
    const [{ data: ls }, total, ligados] = await Promise.all([
      supabase.from('physical_stores').select('id, name'),
      supabase.from('stock_books').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('stock_books').select('id', { count: 'exact', head: true }).eq('active', true).neq('kigest_ref', ''),
    ]);
    setLojas(Object.fromEntries((ls || []).map((l) => [l.id, l.name])));
    setLivros({ total: total.count ?? 0, ligados: ligados.count ?? 0 });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar() {
    setASincronizar(true);
    try {
      const r = await kangestSincronizar();
      toast.success(r?.activo === false ? 'A ligação não está configurada (KANGEST_LIGACOES).' : 'Fila, stock e vendas sincronizados.');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível sincronizar.');
    } finally {
      setASincronizar(false);
    }
  }
  async function repetir(id) {
    try {
      await kangestRepetir(id);
      toast.success('Volta à fila.');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível repetir.');
    }
  }

  if (!estado) return <p className="text-sm text-muted-foreground">A ler o estado da ligação…</p>;
  const valor = (chave) => (estado.estado || []).find((e) => e.chave === chave)?.valor;
  const activo = valor('activo') === true;
  const sincronizado = valor('sincronizado');
  const ligacoes = estado.ligacoes || [];
  const fila = estado.fila || {};
  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', activo ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
          <span className={cn('h-2 w-2 rounded-full', activo ? 'bg-emerald-500' : 'bg-slate-400')} />
          {activo ? 'Ligação activa' : 'Ligação por configurar'}
        </span>
        <span className="text-sm text-muted-foreground">Última sincronização: {dataHora(sincronizado)}</span>
        <Button size="sm" className="ml-auto" onClick={sincronizar} disabled={aSincronizar}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', aSincronizar && 'animate-spin')} />{aSincronizar ? 'A sincronizar…' : 'Sincronizar já'}
        </Button>
      </div>

      <section className="rounded-xl border p-4">
        <h3 className="mb-3 font-semibold">O que falta para a ligação funcionar</h3>
        <ol className="space-y-2 text-sm">
          <Passo feito={ligacoes.length > 0}>
            Segredo <code>KANGEST_LIGACOES</code> na Edge Function, com o endereço HTTPS da API de cada KanGest, a chave e as lojas
            {ligacoes.length > 0 && ` — ${ligacoes.length} ligação(ões)`}.
          </Passo>
          <Passo feito={activo && !!sincronizado}>Agendador: <code>KANGEST_CRON_TOKEN</code> e, no Vault, <code>kangest_cron_url</code> e <code>kangest_cron_token</code>.</Passo>
          <Passo feito={ligacoes.length > 0 && ligacoes.every((l) => l.avisos)}>Avisos automáticos no KanGest (stock, artigos e documentos) com o segredo de cada ligação.</Passo>
          <Passo feito={!!livros && livros.total > 0 && livros.ligados >= livros.total}>
            Livros ligados ao KanGest pela referência: {livros ? `${livros.ligados} de ${livros.total}` : '…'}
            {livros && livros.ligados < livros.total && ' (os outros não recebem stock nem preço)'}.
          </Passo>
          <Passo feito={ligacoes.length > 0 && ligacoes.every((l) => l.portes)}>Artigo dos portes (e um genérico para as edições digitais) em cada ligação.</Passo>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">Passo a passo em <code>docs/KANGEST.md</code>.</p>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Ligações</h3>
        {!ligacoes.length && <p className="text-sm text-muted-foreground">Nenhuma ligação configurada.</p>}
        {ligacoes.map((l) => {
          const aviso = (estado.webhook_url || '').replace('<id>', l.id);
          return (
            <div key={l.id} className="rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{l.id}</span>
                <code className="truncate text-xs text-muted-foreground">{l.url}</code>
                <span className={cn('ml-auto rounded-full px-2 py-0.5 text-xs font-semibold', l.avisos ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700')}>
                  {l.avisos ? 'Avisos ligados' : 'Sem segredo dos avisos'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Lojas: {Object.entries(l.lojas || {}).map(([id, a]) => `${lojas[id] || id} → armazém ${a}`).join(' · ') || 'nenhuma (vai para o armazém do posto da chave)'}
                {l.armazens_online?.length ? ` · vendem online os armazéns ${l.armazens_online.join(', ')}` : ''}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{aviso}</code>
                <Button size="sm" variant="outline" className="h-7" onClick={() => copiar(aviso)}><Copy className="mr-1 h-3.5 w-3.5" />Copiar</Button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Documentos para o KanGest</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FILA.map(([k, rot, cor]) => (
            <div key={k} className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">{rot}</p>
              <p className={cn('text-2xl font-bold tabular-nums', cor)}>{fila[k] || 0}</p>
            </div>
          ))}
        </div>
        {(estado.erros || []).length > 0 && (
          <ul className="divide-y rounded-xl border">
            {estado.erros.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-semibold">{ACCOES[e.accao] || e.accao}</span>
                <span className="text-xs text-muted-foreground">encomenda {e.order_id} · {e.tentativas} tentativa(s) · {dataHora(e.actualizado)}</span>
                <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => repetir(e.id)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Repetir</Button>
                <p className="w-full text-xs text-red-700 dark:text-red-400">{e.erro}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
