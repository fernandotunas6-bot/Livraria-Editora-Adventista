// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BookOpenCheck, Copy, Cpu, Download, Globe, Hash, KeyRound, Link2, LogOut, Plus, Settings2, ShieldCheck, ShieldOff, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  kangestPostoCodigo, kangestPostoConfiguracoes, kangestPostoConfigurar, kangestPostoCriar, kangestPostoLivro, kangestPostoRevogar, kangestPostos,
  kangestSessaoTerminar,
} from '@/api/PlatformApi';
import { resumoDasConfiguracoes } from '@/lib/kangestConfiguracoes';
import { enderecoManualValido } from '@/lib/kangestServidor';
import { cn } from '@/lib/utils';
import { problemasDoComputador, tamanho } from '@/lib/kangestComputadores';

const ESTADOS = {
  activo: ['Ligado', 'bg-estado-ok-fundo text-estado-ok'],
  por_emparelhar: ['À espera do código', 'bg-estado-aviso-fundo text-estado-aviso'],
  revogado: ['Revogado', 'bg-muted text-muted-foreground'],
};
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short' }) : '—');

/** O código acabado de criar: mostra-se uma vez, para escrever no KanGest Livraria (Livraria → Ligação ao site). */
function CodigoNovo({ codigo, endereco, expira, onFechar }) {
  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));
  return (
    <div className="rounded-xl border border-estado-ok/40 bg-estado-ok-fundo p-4 text-sm" role="status">
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
 * Os documentos das encomendas online de um posto (docs/KANGEST-SINCRONIZACAO.md §11): o KanGest da loja emite a NE, a
 * FR, a NC e as anulações pela ligação. Os artigos dos portes e genérico e o modo de pagamento são os que a ligação
 * antiga pedia, agora por posto.
 */
function EncomendasDoPosto({ p, onGuardar }) {
  const [emitir, setEmitir] = useState(!!p.emitir_encomendas);
  const [portes, setPortes] = useState(p.artigo_portes || '');
  const [generico, setGenerico] = useState(p.artigo_generico || '');
  const [modo, setModo] = useState((p.pagamentos || {})['*'] || '');
  const [aGuardar, setAGuardar] = useState(false);
  const mudou = emitir !== !!p.emitir_encomendas || portes !== (p.artigo_portes || '') || generico !== (p.artigo_generico || '')
    || modo !== ((p.pagamentos || {})['*'] || '');
  async function guardar() {
    if (emitir && !p.emitir_encomendas && !confirm(`O KanGest de «${p.nome}» passa a emitir a nota de encomenda de cada encomenda online da loja dele, a factura/recibo quando o pagamento for confirmado no site, a nota de crédito dos reembolsos e a anulação das canceladas.\n\nConfirme no KanGest dessa loja, em Livraria → Ligação ao site, quem emite as encomendas online.`)) return;
    setAGuardar(true);
    try {
      await onGuardar({ emitir_encomendas: emitir, artigo_portes: portes, artigo_generico: generico, modo_pagamento: modo });
    } finally {
      setAGuardar(false);
    }
  }
  return (
    <div className="w-full space-y-2 rounded-lg border border-dashed p-2 text-xs">
      <label className="inline-flex items-center gap-1.5 font-medium">
        <input type="checkbox" checked={emitir} onChange={(e) => setEmitir(e.target.checked)} />
        Emitir os documentos das encomendas online desta loja (NE, FR, NC e anulações)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1">Artigo dos portes
          <input className="h-7 w-28 rounded border bg-background px-2" maxLength={60} value={portes} onChange={(e) => setPortes(e.target.value)} placeholder="ex.: PORTES" />
        </label>
        <label className="inline-flex items-center gap-1">Artigo genérico
          <input className="h-7 w-28 rounded border bg-background px-2" maxLength={60} value={generico} onChange={(e) => setGenerico(e.target.value)} placeholder="ex.: DIVERSOS" />
        </label>
        <label className="inline-flex items-center gap-1">Modo de pagamento
          <input className="h-7 w-16 rounded border bg-background px-2 uppercase" maxLength={4} value={modo} onChange={(e) => setModo(e.target.value.toUpperCase())} placeholder="TB" />
        </label>
        <Button size="sm" variant="outline" className="h-7" onClick={guardar} disabled={!mudou || aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</Button>
      </div>
      <p className="text-muted-foreground">
        Os portes vão numa linha com o artigo dos portes; um produto do site sem referência no KanGest vai com o artigo genérico.
        O modo de pagamento é o do KanGest para as encomendas pagas no site (por omissão, TB).
      </p>
    </div>
  );
}

/**
 * Postos do KanGest Livraria (docs/KANGEST-SINCRONIZACAO.md): cada instalação da edição da livraria que envia as
 * facturas, já assinadas, para a base central. Emparelhar com um código de uso único, pedir outro (computador novo ou
 * rodar a chave) e revogar. Em cada posto, os interruptores do stock e do catálogo (§10) e as encomendas online (§11).
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
      <LivroDoSite resumo={estado.livro_site} />
      {(estado.colisoes || []).length > 0 && (
        <div className="space-y-1 rounded-xl border border-estado-erro/30 bg-estado-erro-fundo p-3 text-sm text-estado-erro" role="alert">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" />Séries repetidas entre postos: os números repetem-se para a AGT</p>
          {estado.colisoes.map((c) => (
            <p key={`${c.tipo_codigo}-${c.serie}`} className="text-xs">
              {c.tipo_codigo} {c.serie}: {(c.postos || []).join(' e ')} ({c.documentos} documento(s)).
            </p>
          ))}
          <p className="text-xs">Em cada KanGest, em «Ligação à livraria», carregue em «Usar o prefixo do site». Os documentos novos saem cada um com a sua série.</p>
        </div>
      )}
      {!estado.configurado && (
        <p className="flex items-start gap-2 rounded-xl border border-estado-aviso/40 bg-estado-aviso-fundo p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-estado-aviso" />
          Falta configurar as chaves da sincronização (KANGEST_SINC_CHAVES e KANGEST_DADOS_CHAVE). Gera-as o
          scripts/kangest/chaves-sinc.mjs; veja docs/KANGEST-SINCRONIZACAO.md.
        </p>
      )}
      {codigo && <CodigoNovo codigo={codigo.codigo} endereco={codigo.endereco} expira={codigo.expira_em} onFechar={() => setCodigo(null)} />}
      {(() => {
        // os computadores que precisam de atenção (o estado que cada KanGest manda: lib/kangestComputadores.js)
        const comProblemas = postos.filter((p) => p.estado === 'activo' && problemasDoComputador(p).some((x) => x.grave));
        return comProblemas.length > 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-estado-erro/30 bg-estado-erro-fundo px-3 py-2 text-sm text-estado-erro">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {comProblemas.length === 1 ? `O computador de «${comProblemas[0].nome}» precisa de atenção.` : `${comProblemas.length} computadores precisam de atenção.`}
          </p>
        ) : null;
      })()}
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
                  <span className="rounded-full bg-estado-erro-fundo px-2 py-0.5 text-xs font-semibold text-estado-erro" title="Documentos cujo hash anterior não bate com o documento anterior da mesma série">
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
                  {p.estado === 'activo' ? <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-estado-ok" /> : <Link2 className="mr-1 inline h-3.5 w-3.5" />}
                  {p.documentos} documento(s) recebido(s)
                  {p.fichas && (p.fichas.entidade || p.fichas.artigo || p.fichas.utilizador)
                    ? ` · fichas: ${p.fichas.entidade || 0} cliente(s) e fornecedor(es), ${p.fichas.artigo || 0} artigo(s), ${p.fichas.utilizador || 0} utilizador(es)`
                    : ''}
                  {p.importados ? ` · ${p.importados} do histórico do KIGEST` : ''}
                  {' '}· última sincronização {dataHora(p.ultima_sinc)}
                  {p.versao_programa ? ` · ${p.versao_programa}` : ''}
                </p>
                {p.ultimo_erro && <p className="w-full text-xs text-estado-erro">{p.ultimo_erro}</p>}
                {p.estado !== 'revogado' && <Computador p={p} />}
                {p.estado !== 'revogado' && <SessoesDoPosto p={p} onTerminada={carregar} />}
                {p.estado === 'activo' && <LivroDoPosto p={p} />}
                {p.estado !== 'revogado' && <ConfiguracoesDoPosto p={p} />}
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
                {p.estado !== 'revogado' && <SeriesDoPosto key={`${p.id}-${p.serie_prefixo || ''}`} p={p} onGuardado={carregar} />}
                {p.estado !== 'revogado' && <EnderecoDoPosto key={`${p.id}-${p.endereco_web || ''}`} p={p} onGuardado={carregar} />}
                {p.estado !== 'revogado' && p.store_id && (
                  <EncomendasDoPosto
                    key={`${p.id}-${p.emitir_encomendas}-${p.artigo_portes}-${p.artigo_generico}-${(p.pagamentos || {})['*'] || ''}`}
                    p={p}
                    onGuardar={async (opcoes) => {
                      try {
                        await kangestPostoConfigurar(p.id, opcoes);
                        toast.success('Encomendas do posto guardadas.');
                        carregar();
                      } catch (e) {
                        toast.error(e?.message || 'Não foi possível guardar.');
                      }
                    }}
                  />
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

/**
 * O prefixo das séries do posto, único em toda a rede (migração 20261128130000): o KanGest dele emite FR HUA2026/1, e
 * duas lojas com o mesmo NIF nunca repetem os números. Automático ao criar o posto (o código da loja, HUA2 no
 * segundo…); à mão, outro livre. Um prefixo nunca se reutiliza, nem o de um posto revogado.
 */
export function SeriesDoPosto({ p, onGuardado }) {
  const [valor, setValor] = useState(p.serie_prefixo || '');
  const [aGuardar, setAGuardar] = useState(false);
  const limpo = valor.trim().toUpperCase();
  const valido = /^[A-Z0-9]{1,8}$/.test(limpo);
  const mudou = limpo !== (p.serie_prefixo || '');
  async function guardar(ev) {
    ev.preventDefault();
    if (!valido || !mudou) return;
    setAGuardar(true);
    try {
      await kangestPostoConfigurar(p.id, { serie_prefixo: limpo });
      toast.success(`O posto passa a ter o prefixo ${limpo}: o KanGest dele usa-o a partir da próxima volta.`);
      onGuardado?.();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível guardar.');
    } finally {
      setAGuardar(false);
    }
  }
  return (
    <form onSubmit={guardar} className="flex w-full flex-wrap items-center gap-2 text-xs">
      <Hash className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">
        Séries dos documentos: <strong>FR {p.serie_prefixo || '…'}{new Date().getFullYear()}/1</strong> (prefixo único na rede)
      </span>
      <label className="sr-only" htmlFor={`prefixo-${p.id}`}>Prefixo das séries</label>
      <input
        id={`prefixo-${p.id}`}
        className={cn('h-7 w-24 rounded-md border bg-background px-2 uppercase', !valido && 'border-destructive')}
        value={valor}
        maxLength={8}
        onChange={(e) => setValor(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        aria-invalid={!valido}
      />
      <Button size="sm" variant="outline" className="h-7" type="submit" disabled={!mudou || !valido || aGuardar}>Guardar</Button>
      {!valido && <span className="text-destructive">1 a 8 letras ou algarismos</span>}
    </form>
  );
}

/**
 * O endereço do KanGest na rede da loja, por onde «Abrir no KanGest» abre os ecrãs sem a ligação kangest:// (migração
 * 20261128110000). Automático: o que o KanGest servidor diz (com o modo web ligado). Ao lado, escreve-se outro à mão
 * (um nome da rede da loja, outra porta); vazio volta ao automático.
 */
export function EnderecoDoPosto({ p, onGuardado }) {
  const automatico = p.estado_computador?.endereco_web || '';
  const [valor, setValor] = useState(p.endereco_web || '');
  const [aGuardar, setAGuardar] = useState(false);
  const mudou = valor.trim().replace(/\/+$/, '') !== (p.endereco_web || '');
  const valido = !valor.trim() || enderecoManualValido(valor);
  async function guardar(ev) {
    ev.preventDefault();
    if (!valido) return;
    setAGuardar(true);
    try {
      await kangestPostoConfigurar(p.id, { endereco_web: valor.trim() });
      toast.success(valor.trim() ? 'Endereço do KanGest guardado.' : 'Volta ao endereço que o KanGest diz.');
      onGuardado?.();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível guardar.');
    } finally {
      setAGuardar(false);
    }
  }
  return (
    <form onSubmit={guardar} className="flex w-full flex-wrap items-center gap-2 text-xs">
      <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">
        Abrir no KanGest pela loja:{' '}
        {p.endereco_web ? <strong>{p.endereco_web}</strong> : automatico ? <strong>{automatico}</strong> : 'sem servidor (abre o programa deste computador)'}
        {!p.endereco_web && automatico ? ' (automático)' : ''}
      </span>
      <label className="sr-only" htmlFor={`endereco-${p.id}`}>Endereço do KanGest na rede da loja</label>
      <input
        id={`endereco-${p.id}`}
        className={cn('h-7 w-56 rounded-md border bg-background px-2', !valido && 'border-destructive')}
        placeholder={automatico || 'http://192.168.1.10:7799'}
        value={valor}
        maxLength={100}
        onChange={(e) => setValor(e.target.value)}
        aria-invalid={!valido}
      />
      <Button size="sm" variant="outline" className="h-7" type="submit" disabled={!mudou || !valido || aGuardar}>Guardar</Button>
      {!valido && <span className="text-destructive">Escreva como http://192.168.1.10:7799</span>}
    </form>
  );
}

/** O computador do posto: o que o KanGest mandou na última volta (sinc/estado.rs) e o que precisa de atenção. */
function Computador({ p }) {
  const e = p.estado_computador || {};
  if (!Object.keys(e).length) {
    return p.estado === 'activo' ? (
      <p className="w-full text-xs text-muted-foreground">
        <Cpu className="mr-1 inline h-3.5 w-3.5" />O estado do computador aparece quando este posto tiver o KanGest 1.4.8 ou mais recente.
      </p>
    ) : null;
  }
  const problemas = problemasDoComputador(p);
  const partes = [
    e.sistema,
    e.nucleos ? `${e.nucleos} núcleos` : null,
    e.memoria ? `${tamanho(e.memoria)} de memória` : null,
    e.espaco_livre != null ? `${tamanho(e.espaco_livre)} livres` : null,
    e.base_bytes != null ? `base de ${tamanho(e.base_bytes)}` : null,
    e.ultima_copia ? `última cópia ${dataHora(e.ultima_copia)}` : null,
    e.modo === 'servidor' ? 'servidor dos postos em rede' : null,
    e.bandeja ? 'fica na bandeja ao fechar' : null,
    e.acordado ? 'não adormece' : null,
  ].filter(Boolean);
  return (
    <div className="w-full space-y-1 text-xs">
      <p className="text-muted-foreground">
        <Cpu className="mr-1 inline h-3.5 w-3.5" />
        {partes.join(' · ')}
        {p.estado_em ? ` · estado de ${dataHora(p.estado_em)}` : ''}
      </p>
      {problemas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {problemas.map((x) => (
            <span
              key={x.texto}
              className={cn('rounded-full px-2 py-0.5 font-semibold', x.grave ? 'bg-estado-erro-fundo text-estado-erro' : 'bg-estado-aviso-fundo text-estado-aviso')}
            >
              {x.texto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Quem está dentro do KanGest deste posto (KANGEST ONE, A3): as sessões abertas que ele mandou na última volta, sem
 * tokens. «Terminar» pede o fim; a volta seguinte do posto leva o pedido, e a pessoa volta ao ecrã de entrada. O ADMIN
 * local de recurso aparece marcado (cada entrada dele está no registo de segurança).
 */
export function SessoesDoPosto({ p, onTerminada }) {
  const [aTerminar, setATerminar] = useState('');
  const todas = p.sessoes || [];
  const abertas = todas.filter((s) => !s.fim);
  const terminadas = todas.filter((s) => s.fim);
  if (!todas.length) return null;

  async function terminar(s) {
    const quem = s.nome || s.login;
    if (!confirm(`Terminar a sessão de «${quem}» em «${p.nome}»?\n\nNa próxima sincronização do posto (em menos de um minuto, com Internet), a pessoa volta ao ecrã de entrada.`)) return;
    setATerminar(s.sessao);
    try {
      await kangestSessaoTerminar(p.id, s.sessao);
      toast.success('Pedido enviado: a sessão termina na próxima sincronização do posto.');
      onTerminada?.();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível terminar a sessão.');
    } finally {
      setATerminar('');
    }
  }

  return (
    <div className="w-full space-y-1.5 text-xs">
      <p className="font-semibold text-muted-foreground">
        <UserRound className="mr-1 inline h-3.5 w-3.5" />
        {abertas.length === 0 ? 'Ninguém dentro do KanGest agora' : abertas.length === 1 ? '1 pessoa dentro do KanGest' : `${abertas.length} pessoas dentro do KanGest`}
      </p>
      {abertas.length > 0 && (
        <ul className="space-y-1">
          {abertas.map((s) => (
            <li key={s.sessao} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1.5">
              <span className="font-semibold">{s.nome || s.login}</span>
              <span className="text-muted-foreground">{s.perfil}</span>
              {s.recurso && (
                <span className="rounded-full bg-estado-erro-fundo px-2 py-0.5 font-semibold text-estado-erro" title="O perfil Administrador local, sem conta do site: cada entrada fica no registo de segurança">
                  ADMIN de recurso
                </span>
              )}
              {!s.recurso && !s.conta_site && (
                <span className="rounded-full bg-estado-aviso-fundo px-2 py-0.5 font-semibold text-estado-aviso" title="Conta só do KanGest: tem de se ligar a uma conta do site">
                  conta local
                </span>
              )}
              {s.offline && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">sem Internet</span>}
              <span className="text-muted-foreground">
                {[s.aparelho, s.local, s.inicio ? `desde ${dataHora(s.inicio)}` : null].filter(Boolean).join(' · ')}
              </span>
              <span className="ml-auto">
                {s.revogar_em ? (
                  <span className="text-muted-foreground">a terminar na próxima sincronização…</span>
                ) : (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={aTerminar === s.sessao} onClick={() => terminar(s)}>
                    <LogOut className="mr-1 h-3 w-3" />{aTerminar === s.sessao ? 'A pedir…' : 'Terminar'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {terminadas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{terminadas.length} sessão(ões) terminada(s) nos últimos 7 dias</summary>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {terminadas.slice(0, 30).map((s) => (
              <li key={s.sessao}>
                {s.nome || s.login} ({s.perfil}{s.recurso ? ', ADMIN de recurso' : ''}) · {dataHora(s.inicio)} → {dataHora(s.fim)}
                {s.motivo === 'revogada' ? ' · terminada no painel' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * As configurações que o posto guardou na base central (pedido do dono a 27/11; sinc/configuracoes.rs): quando chegou a
 * última, o que tem, as versões anteriores e a descarga da fotografia (sem segredos: o posto e o servidor tiram-nos).
 */
export function ConfiguracoesDoPosto({ p }) {
  const [aberto, setAberto] = useState(null);
  const [aVer, setAVer] = useState(false);
  const c = p.configuracoes;

  async function ver(versao) {
    setAVer(true);
    try {
      setAberto(await kangestPostoConfiguracoes(p.id, versao));
    } catch (e) {
      toast.error(e?.message || 'Não foi possível ler as configurações.');
    } finally {
      setAVer(false);
    }
  }

  function descarregar() {
    if (!aberto?.dados) return;
    const blob = new Blob([JSON.stringify(aberto.dados, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kangest-configuracoes-${(p.nome || 'posto').replace(/[^\w-]+/g, '-')}-${String(aberto.versao?.recebido_em || '').slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const resumo = aberto?.dados ? resumoDasConfiguracoes(aberto.dados) : null;
  return (
    <div className="w-full space-y-1 text-xs">
      <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" />
        {c ? <span>Configurações guardadas no site a {dataHora(c.recebido_em)}</span> : <span>Configurações: ainda não chegaram (o KanGest 1.4.11 manda-as na volta seguinte).</span>}
        {c && (
          <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => (aberto ? setAberto(null) : ver())} disabled={aVer}>
            {aberto ? 'Fechar' : aVer ? 'A abrir…' : 'Ver'}
          </button>
        )}
      </p>
      {aberto && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
          {resumo && (
            <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {resumo.map((r) => <li key={r.rotulo}><span className="text-muted-foreground">{r.rotulo}:</span> {r.valor}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`cfg-versao-${p.id}`}>Versão</label>
            <select
              id={`cfg-versao-${p.id}`}
              className="h-7 rounded-md border bg-background px-2"
              value={aberto.versao?.id || ''}
              onChange={(e) => ver(Number(e.target.value))}
            >
              {(aberto.versoes || []).map((v) => <option key={v.id} value={v.id}>{dataHora(v.recebido_em)}</option>)}
            </select>
            <Button size="sm" variant="outline" className="h-7" onClick={descarregar}>
              <Download className="mr-1 h-3.5 w-3.5" />Descarregar (JSON)
            </Button>
            <span className="text-muted-foreground">{(aberto.versoes || []).length} versão(ões) guardada(s), sem senhas nem chaves.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * O livro único de stock do posto, em sombra (KANGEST ONE, B1): quantos movimentos tem e se a soma bate certo com a
 * fotografia que o posto manda. «Ver» mostra as diferenças (até 200), por armazém e referência.
 */
export function LivroDoPosto({ p }) {
  const [diferencas, setDiferencas] = useState(null);
  const [negativos, setNegativos] = useState([]);
  const [aVer, setAVer] = useState(false);
  const l = p.livro;
  if (!l) return null;

  async function ver() {
    setAVer(true);
    try {
      const r = await kangestPostoLivro(p.id);
      setDiferencas(r.diferencas || []);
      setNegativos(r.negativos || []);
    } catch (e) {
      toast.error(e?.message || 'Não foi possível ler o livro de stock.');
    } finally {
      setAVer(false);
    }
  }

  return (
    <div className="w-full space-y-1 text-xs">
      <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <BookOpenCheck className="h-3.5 w-3.5" />
        {!l.aberto ? (
          <span>Livro de stock: à espera da abertura (o KanGest 1.4.9 ou mais recente manda-a na primeira volta).</span>
        ) : (
          <>
            <span>Livro de stock: {l.movimentos} movimento(s)</span>
            {l.negativos > 0 && (
              <span className="rounded-full bg-estado-erro-fundo px-2 py-0.5 font-semibold text-estado-erro" title="Uma venda sem Internet deixou o livro abaixo de zero: acerte o stock no KanGest">
                {l.negativos} artigo(s) com stock negativo
              </span>
            )}
            {l.divergencias === 0 && !l.negativos ? (
              <span className="rounded-full bg-estado-ok-fundo px-2 py-0.5 font-semibold text-estado-ok">bate certo com o posto</span>
            ) : (
              <>
                {l.divergencias > 0 && (
                  <span className="rounded-full bg-estado-aviso-fundo px-2 py-0.5 font-semibold text-estado-aviso">
                    {l.divergencias} diferença(s) com o posto
                  </span>
                )}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={ver} disabled={aVer}>
                  {aVer ? 'A ler…' : 'Ver'}
                </button>
              </>
            )}
          </>
        )}
      </p>
      {negativos.length > 0 && (
        <p className="text-estado-erro">
          Stock negativo no livro: {negativos.map((n) => `${n.referencia} (armazém ${n.armazem_id}: ${Number(n.livro)})`).join(' · ')}
        </p>
      )}
      {diferencas && diferencas.length > 0 && (
        <table className="w-full max-w-md text-left">
          <thead className="text-muted-foreground">
            <tr><th className="font-medium">Referência</th><th className="font-medium">Armazém</th><th className="text-right font-medium">Livro</th><th className="text-right font-medium">Posto</th></tr>
          </thead>
          <tbody>
            {diferencas.map((d) => (
              <tr key={`${d.armazem_id}-${d.referencia}`}>
                <td>{d.referencia}</td><td>{d.armazem_id}</td><td className="text-right">{Number(d.livro)}</td><td className="text-right">{Number(d.fotografia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * As reservas das encomendas do site no livro de stock (KANGEST ONE, B2): o checkout reserva, e o cancelamento ou a FR
 * do posto libertam. Em sombra: o stock à venda ainda não sai do livro.
 */
export function LivroDoSite({ resumo }) {
  if (!resumo) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <BookOpenCheck className="h-3.5 w-3.5" />
      {resumo.reservas_abertas === 0
        ? 'Livro de stock do site: nenhuma reserva por libertar.'
        : `Livro de stock do site: ${resumo.unidades} unidade(s) reservada(s) em ${resumo.encomendas} encomenda(s), à espera da factura do posto ou do cancelamento.`}
    </p>
  );
}
