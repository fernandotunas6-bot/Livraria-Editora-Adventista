// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Copy, RefreshCw, RotateCcw, Stethoscope, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { kangestEstado, kangestRepetir, kangestSincronizar, kangestTestar } from '@/api/PlatformApi';
import { cn } from '@/lib/utils';

const ACCOES = { ne: 'Nota de encomenda', fr: 'Factura/Recibo', anular: 'Anulação', nc: 'Nota de crédito' };
const KanGestConfigurador = lazy(() => import('./KanGestConfigurador'));
const KanGestPostos = lazy(() => import('./KanGestPostos'));
const KanGestDescarregar = lazy(() => import('./KanGestDescarregar'));

const FILA = [['pendente', 'Na fila', 'text-amber-600'], ['processando', 'A sair agora', 'text-sky-600'], ['feito', 'Feitos', 'text-emerald-600'], ['erro', 'Com erro', 'text-red-600'], ['ignorado', 'Não vão', 'text-muted-foreground']];
const NIVEL = {
  ok: [CheckCircle2, 'text-emerald-600'],
  aviso: [AlertTriangle, 'text-amber-600'],
  erro: [XCircle, 'text-red-600'],
};
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short' }) : '—');

function Verificacoes({ lista }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {lista.map((v, i) => {
        const [Icone, cor] = NIVEL[v.nivel] || NIVEL.aviso;
        return <li key={i} className="flex items-start gap-2"><Icone className={cn('mt-0.5 h-4 w-4 shrink-0', cor)} /><span>{v.texto}</span></li>;
      })}
    </ul>
  );
}

function Passo({ feito, children }) {
  return (
    <li className="flex items-start gap-2">
      {feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={cn(!feito && 'text-muted-foreground')}>{children}</span>
    </li>
  );
}

/**
 * Ligação ao KanGest (docs/KANGEST.md). Em cima, o KanGest Livraria: o instalador para descarregar e os postos. Em
 * baixo, fechada, a ligação antiga pela API de cada KanGest, desligada desde 2026-11-24: se está activa, as ligações e
 * as lojas de cada uma, quantos livros estão ligados por referência, a fila dos documentos (NE, FR, anulações, notas de
 * crédito) e os erros, e sincronizar já.
 */
export default function KanGestTab() {
  const [estado, setEstado] = useState(null);
  const [lojas, setLojas] = useState([]);
  const [teste, setTeste] = useState(null);
  const [aTestar, setATestar] = useState(false);
  const [configurar, setConfigurar] = useState(false);
  const [livros, setLivros] = useState(null);
  const [aSincronizar, setASincronizar] = useState(false);
  const [antiga, setAntiga] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEstado(await kangestEstado());
    } catch (e) {
      toast.error(e?.message || 'Não foi possível ler o estado da ligação.');
    }
    const [{ data: ls }, total, ligados] = await Promise.all([
      supabase.from('physical_stores').select('id, name, active').order('name'),
      supabase.from('stock_books').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('stock_books').select('id', { count: 'exact', head: true }).eq('active', true).neq('kigest_ref', ''),
    ]);
    setLojas(ls || []);
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
  async function testar() {
    setATestar(true);
    try {
      const r = await kangestTestar();
      setTeste(r);
      if (r?.ok) toast.success('A ligação está pronta.');
      else toast.error('Há pontos a corrigir: veja o resultado do teste.');
    } catch (e) {
      toast.error(e?.message || 'Não foi possível testar.');
    } finally {
      setATestar(false);
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

  const valor = (chave) => (estado?.estado || []).find((e) => e.chave === chave)?.valor;
  const activo = valor('activo') === true;
  const sincronizado = valor('sincronizado');
  const ligacoes = estado?.ligacoes || [];
  const fila = estado?.fila || {};
  const nomeLoja = Object.fromEntries(lojas.map((l) => [l.id, l.name]));
  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));

  return (
    <div className="space-y-6">
      {/* O KanGest Livraria: o instalador e os postos (docs/KANGEST.md, «A edição da livraria»). */}
      <Suspense fallback={null}>
        <KanGestDescarregar />
        <KanGestPostos lojas={lojas} />
      </Suspense>

      {/*
        A ligação antiga (o site a chamar a API de cada KanGest por um túnel): desligada desde 2026-11-24, nunca chegou a
        funcionar em produção. Fica para consulta, fechada.
      */}
      <section className="rounded-xl border">
        <button type="button" className="flex w-full flex-wrap items-center gap-2 p-4 text-left font-semibold" onClick={() => setAntiga((v) => !v)} aria-expanded={antiga}>
          Ligação antiga pela API de cada KanGest
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', activo ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
            {activo ? 'Activa' : 'Desligada'}
          </span>
          <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', antiga && 'rotate-180')} />
        </button>
        {antiga && (
          <div className="space-y-6 border-t p-4">
            <p className="text-sm text-muted-foreground">
              O site chamava a API de cada KanGest por um túnel de entrada em cada loja. Nunca chegou a funcionar em produção e está
              desligada, sem agendador. O KanGest Livraria liga-se pelos postos, acima: é ele que chama o site, sem túnel. Fica aqui só
              para consulta (<code>docs/KANGEST.md</code>).
            </p>
            {!estado ? <p className="text-sm text-muted-foreground">A ler o estado da ligação…</p> : (
            <>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', activo ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
          <span className={cn('h-2 w-2 rounded-full', activo ? 'bg-emerald-500' : 'bg-slate-400')} />
          {activo ? 'Ligação activa' : 'Ligação por configurar'}
        </span>
        <span className="text-sm text-muted-foreground">Última sincronização: {dataHora(sincronizado)}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={testar} disabled={aTestar}>
          <Stethoscope className={cn('mr-1.5 h-4 w-4', aTestar && 'animate-pulse')} />{aTestar ? 'A testar…' : 'Testar ligação'}
        </Button>
        <Button size="sm" onClick={sincronizar} disabled={aSincronizar}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', aSincronizar && 'animate-spin')} />{aSincronizar ? 'A sincronizar…' : 'Sincronizar já'}
        </Button>
      </div>

      {teste && (
        <section className={cn('space-y-4 rounded-xl border p-4', teste.ok ? 'border-emerald-500/40' : 'border-red-500/40')}>
          <h3 className="font-semibold">{teste.ok ? 'Teste: tudo pronto' : 'Teste: há pontos a corrigir'}</h3>
          {(teste.geral || []).length > 0 && <Verificacoes lista={teste.geral} />}
          {(teste.ligacoes || []).map((r) => (
            <div key={r.id} className="space-y-2">
              <p className="text-sm font-semibold">
                {r.id}{r.empresa ? ` — ${r.empresa}` : ''}{r.posto ? <span className="font-normal text-muted-foreground"> · posto {r.posto}</span> : null}
              </p>
              <Verificacoes lista={r.verificacoes || []} />
              {(r.armazens || []).length > 0 && (
                <p className="text-xs text-muted-foreground">Armazéns deste KanGest: {r.armazens.map((a) => `${a.id} ${a.nome}`).join(' · ')}</p>
              )}
            </div>
          ))}
        </section>
      )}

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

      <section className="rounded-xl border">
        <button type="button" className="flex w-full items-center gap-2 p-4 text-left font-semibold" onClick={() => setConfigurar((v) => !v)} aria-expanded={configurar}>
          Configurar a ligação
          <span className="text-xs font-normal text-muted-foreground">gera o segredo KANGEST_LIGACOES e o agendador</span>
          <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', configurar && 'rotate-180')} />
        </button>
        {configurar && (
          <div className="border-t p-4">
            <Suspense fallback={<p className="text-sm text-muted-foreground">A abrir…</p>}>
              <KanGestConfigurador ligacoesActuais={ligacoes} lojas={lojas} />
            </Suspense>
          </div>
        )}
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
                Lojas: {Object.entries(l.lojas || {}).map(([id, a]) => `${nomeLoja[id] || id} → armazém ${a}`).join(' · ') || 'nenhuma (vai para o armazém do posto da chave)'}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
            </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
