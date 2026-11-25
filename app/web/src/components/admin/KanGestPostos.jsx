// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, KeyRound, Link2, Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { kangestPostoCodigo, kangestPostoConfigurar, kangestPostoCriar, kangestPostoRevogar, kangestPostos } from '@/api/PlatformApi';
import { cn } from '@/lib/utils';

const ESTADOS = {
  activo: ['Ligado', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'],
  por_emparelhar: ['À espera do código', 'bg-amber-500/10 text-amber-700 dark:text-amber-400'],
  revogado: ['Revogado', 'bg-muted text-muted-foreground'],
};
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short' }) : '—');

/** O código acabado de criar: mostra-se uma vez, para escrever no KanGest Livraria (Livraria → Ligação ao site). */
function CodigoNovo({ codigo, endereco, expira, onFechar }) {
  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));
  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm" role="status">
      <p className="font-semibold">Escreva este código no KanGest Livraria, em Livraria → Ligação ao site</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-background px-3 py-2 font-mono text-2xl font-bold tracking-[0.2em]">{codigo}</code>
        <Button size="sm" variant="outline" onClick={() => copiar(codigo)}><Copy className="mr-1 h-3.5 w-3.5" />Copiar</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Serve uma vez e até às {new Date(expira).toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' })}.
        Não fica guardado: se fechar esta caixa, peça outro. Endereço da ligação:
      </p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{endereco}</code>
        <Button size="sm" variant="outline" className="h-7" onClick={() => copiar(endereco)}><Copy className="mr-1 h-3.5 w-3.5" />Copiar</Button>
      </div>
      <Button size="sm" variant="ghost" className="mt-2" onClick={onFechar}>Fechar</Button>
    </div>
  );
}

/**
 * Postos do KanGest Livraria (docs/KANGEST-SINCRONIZACAO.md): cada instalação da edição da livraria que envia as
 * facturas, já assinadas, para a base central. Emparelhar com um código de uso único, pedir outro (computador novo ou
 * rodar a chave) e revogar.
 */
export default function KanGestPostos({ lojas = [] }) {
  const [estado, setEstado] = useState(null);
  const [nome, setNome] = useState('');
  const [loja, setLoja] = useState('');
  const [codigo, setCodigo] = useState(null);
  const [aCriar, setACriar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEstado(await kangestPostos());
    } catch (e) {
      toast.error(e?.message || 'Não foi possível ler os postos.');
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function criar(ev) {
    ev.preventDefault();
    setACriar(true);
    try {
      const r = await kangestPostoCriar({ nome, store_id: loja });
      setCodigo(r);
      setNome('');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível criar o posto.');
    } finally {
      setACriar(false);
    }
  }
  async function novoCodigo(p) {
    if (p.estado === 'activo' && !confirm(`Pedir outro código para «${p.nome}»?\n\nA chave actual deixa de valer já: o KanGest desse posto só volta a enviar depois de emparelhado com o código novo.`)) return;
    try {
      setCodigo(await kangestPostoCodigo(p.id));
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível pedir outro código.');
    }
  }
  async function configurar(p, opcao, valor) {
    const avisos = {
      stock_online: valor
        ? `O stock de «${p.nome}» passa a contar para o stock à venda no site (somado ao dos outros postos que contam).\n\nLigue-o só quando todas as lojas que vendem online estiverem ligadas, ou se este KanGest tiver o stock todo: os produtos que este KanGest não tem deixam de mudar, mas os que tem passam a valer o que ele diz.`
        : `O stock de «${p.nome}» deixa de contar para o stock à venda no site. Continua a dar o «temos / não temos» da loja dele.`,
      manda_catalogo: valor
        ? `Os preços do site e os produtos novos (ocultos, à espera de fotografia) passam a vir de «${p.nome}».\n\nSó um posto manda no catálogo: se outro mandava, deixa de mandar.`
        : `Os preços e os produtos novos deixam de vir de «${p.nome}».`,
    };
    if (!confirm(avisos[opcao])) return;
    try {
      await kangestPostoConfigurar(p.id, { [opcao]: valor });
      toast.success('Posto actualizado.');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível mudar o posto.');
    }
  }
  async function revogar(p) {
    if (!confirm(`Revogar «${p.nome}»?\n\nO KanGest desse posto deixa de poder enviar já. As facturas que já chegaram ficam; o stock que ele mandou sai do site.`)) return;
    try {
      await kangestPostoRevogar(p.id);
      toast.success(`«${p.nome}» revogado.`);
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível revogar.');
    }
  }

  if (!estado) return null;
  const nomeLoja = Object.fromEntries(lojas.map((l) => [l.id, l.name]));
  const postos = estado.postos || [];

  return (
    <section className="space-y-3" aria-labelledby="kangest-postos">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="kangest-postos" className="font-semibold">Postos do KanGest Livraria</h3>
        <span className="text-xs text-muted-foreground">as facturas da loja, já assinadas, chegam à base central cifradas e assinadas</span>
      </div>
      {!estado.configurado && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          Falta configurar as chaves da sincronização (KANGEST_SINC_CHAVES e KANGEST_DADOS_CHAVE). Gera-as o
          scripts/kangest/chaves-sinc.mjs; veja docs/KANGEST-SINCRONIZACAO.md.
        </p>
      )}
      {codigo && <CodigoNovo codigo={codigo.codigo} endereco={codigo.endereco} expira={codigo.expira_em} onFechar={() => setCodigo(null)} />}
      {postos.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {postos.map((p) => {
            const [rotulo, cor] = ESTADOS[p.estado] || ESTADOS.revogado;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-semibold">{p.nome}</span>
                <span className="text-xs text-muted-foreground">{nomeLoja[p.store_id] || 'sem loja'}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cor)}>{rotulo}</span>
                {p.partidas > 0 && (
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400" title="Documentos cujo hash anterior não bate com o documento anterior da mesma série">
                    {p.partidas} elo(s) da cadeia AGT partidos
                  </span>
                )}
                <span className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => novoCodigo(p)} disabled={!estado.configurado}>
                    <KeyRound className="mr-1 h-3.5 w-3.5" />{p.estado === 'activo' ? 'Rodar a chave' : 'Novo código'}
                  </Button>
                  {p.estado !== 'revogado' && (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => revogar(p)}>
                      <ShieldOff className="mr-1 h-3.5 w-3.5" />Revogar
                    </Button>
                  )}
                </span>
                <p className="w-full text-xs text-muted-foreground">
                  {p.estado === 'activo' ? <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="mr-1 inline h-3.5 w-3.5" />}
                  {p.documentos} documento(s) recebido(s) · última sincronização {dataHora(p.ultima_sinc)}
                  {p.versao_programa ? ` · ${p.versao_programa}` : ''}
                </p>
                {p.ultimo_erro && <p className="w-full text-xs text-red-700 dark:text-red-400">{p.ultimo_erro}</p>}
                {p.estado !== 'revogado' && (
                  <div className="flex w-full flex-wrap gap-x-5 gap-y-1 text-xs">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={!!p.stock_online} onChange={(e) => configurar(p, 'stock_online', e.target.checked)} />
                      Conta para o stock à venda no site
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={!!p.manda_catalogo} onChange={(e) => configurar(p, 'manda_catalogo', e.target.checked)} />
                      Manda no catálogo (preços e produtos novos)
                    </label>
                    {!p.store_id && !p.stock_online && <span className="text-muted-foreground">Sem loja e sem contar para o site: o stock dele não é usado.</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={criar} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="kangest-posto-nome">Nome do posto</label>
        <input
          id="kangest-posto-nome"
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          placeholder="Nome do posto (ex.: Loja do Huambo)"
          maxLength={80}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <label className="sr-only" htmlFor="kangest-posto-loja">Loja</label>
        <select id="kangest-posto-loja" className="h-9 rounded-md border bg-background px-2 text-sm" value={loja} onChange={(e) => setLoja(e.target.value)}>
          <option value="">Sem loja</option>
          {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <Button size="sm" type="submit" disabled={!nome.trim() || aCriar || !estado.configurado}>
          <Plus className="mr-1 h-4 w-4" />{aCriar ? 'A criar…' : 'Novo posto'}
        </Button>
      </form>
    </section>
  );
}
