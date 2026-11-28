// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader2, Printer, ReceiptText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { kangestDocumento, kangestDocumentos } from '@/api/PlatformApi';
import { TIPOS, data, hora, kz, montarDocumento, nomeDoDocumento, textoReimpressao } from '@/lib/kangestRecibo';
import { PAGINAS, imprimirElemento } from '@/lib/imprimirElemento';
import { FolhaA4, Talao } from './KanGestRecibo';

const FORMATO_KEY = 'kangest-documentos:formato';
const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const campo = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

/**
 * Os documentos do KanGest no painel, como o KanGest os mostra (pedido do dono a 27/11: «implementar o estilo de
 * recibos do KanGest na livraria, e a lógica de visualizar os recibos igual à do KanGest»). A lista filtra-se como no
 * ecrã Documentos do KanGest: o período, a loja, o tipo, o estado e o n.º ou o NIF. Abrir um documento mostra o talão
 * de 80 mm ou o A4, como saem da impressora da loja, e imprime a 2.ª via. Quem vê: quem vê os relatórios de vendas.
 * Os nomes e os NIF dos clientes só se decifram no servidor.
 */
export default function KanGestDocumentos() {
  const [lojas, setLojas] = useState([]);
  const [filtros, setFiltros] = useState({ de: diasAtras(30), ate: hojeISO(), loja: '', tipo: '', estado: '', q: '' });
  const [pesquisa, setPesquisa] = useState('');
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    supabase.from('physical_stores').select('id, name').order('name').then(({ data: ls }) => setLojas(ls || []));
  }, []);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    kangestDocumentos({ ...filtros, pagina })
      .then((r) => { if (vivo) { setLista(r); setErro(''); } })
      .catch((e) => { if (vivo) setErro(e?.message || 'Não foi possível carregar os documentos.'); })
      .finally(() => { if (vivo) setACarregar(false); });
    return () => { vivo = false; };
  }, [filtros, pagina]);

  const mudar = (k, v) => { setPagina(0); setFiltros((f) => ({ ...f, [k]: v })); };
  const nomeDaLoja = (id) => lojas.find((l) => l.id === id)?.name || '';
  const docs = lista?.documentos || [];
  const total = lista?.total || 0;
  const porPagina = lista?.por_pagina || 50;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ReceiptText className="h-5 w-5" aria-hidden="true" /> Documentos do KanGest</h2>
        <p className="text-sm text-muted-foreground">
          As facturas, os recibos e as notas que as lojas emitiram no KanGest, como saíram da impressora: o talão ou o A4.
          Daqui imprime-se a 2.ª via. Os documentos não se alteram: corrigem-se com uma nota de crédito no KanGest.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); mudar('q', pesquisa.trim()); }}
      >
        <label className="grid gap-1 text-xs text-muted-foreground">De
          <input type="date" className={campo} value={filtros.de} max={filtros.ate} onChange={(e) => mudar('de', e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Até
          <input type="date" className={campo} value={filtros.ate} min={filtros.de} max={hojeISO()} onChange={(e) => mudar('ate', e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Loja
          <select className={campo} value={filtros.loja} onChange={(e) => mudar('loja', e.target.value)}>
            <option value="">Todas</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Tipo
          <select className={campo} value={filtros.tipo} onChange={(e) => mudar('tipo', e.target.value)}>
            <option value="">Todos</option>
            {['FR', 'FT', 'NC', 'RC', 'ND', 'PP', 'NE', 'GT'].map((t) => <option key={t} value={t}>{t} · {TIPOS[t][0]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Estado
          <select className={campo} value={filtros.estado} onChange={(e) => mudar('estado', e.target.value)}>
            <option value="">Todos</option>
            <option value="N">Normais</option>
            <option value="A">Anulados</option>
            <option value="F">Facturados</option>
          </select>
        </label>
        <div className="flex min-w-[14rem] flex-1 items-end gap-2">
          <label className="grid flex-1 gap-1 text-xs text-muted-foreground">N.º do documento ou NIF
            <Input value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder="FR K2026/15 ou 5000123456" className="h-9" />
          </label>
          <Button type="submit" size="sm" variant="outline" className="h-9" aria-label="Procurar"><Search className="h-4 w-4" /></Button>
        </div>
      </form>

      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Loja · operador</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr
                key={d.id}
                className="cursor-pointer border-t border-border hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none"
                tabIndex={0}
                onClick={() => setAberto(d.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberto(d.id); } }}
              >
                <td className="whitespace-nowrap px-3 py-2">{data(d.data_emissao)} <span className="text-muted-foreground">{hora(d.data_hora)}</span></td>
                <td className="px-3 py-2">
                  <span className="font-medium">{d.numero_doc}</span>
                  <span className="block text-xs text-muted-foreground">{d.tipo_desc || TIPOS[d.tipo_codigo]?.[0] || d.tipo_codigo}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {d.estado === 'A' && <Badge variant="destructive">Anulado</Badge>}
                    {d.importado && <Badge variant="outline">Do KIGEST</Badge>}
                    {d.cadeia === 'partida' && <Badge variant="destructive">Assinatura por conferir</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2">{d.cliente}</td>
                <td className="px-3 py-2 text-muted-foreground">{[nomeDaLoja(d.store_id), d.operador].filter(Boolean).join(' · ') || '—'}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${d.estado === 'A' ? 'text-muted-foreground line-through' : ''}`}>{kz(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!docs.length && !aCarregar && !erro && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum documento neste período. Os documentos chegam quando o KanGest da loja está ligado ao site.
          </p>
        )}
        {aCarregar && !docs.length && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="A carregar" /></div>}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{total} documento{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={pagina === 0 || aCarregar} onClick={() => setPagina((p) => p - 1)} aria-label="Anteriores"><ChevronLeft className="h-4 w-4" /></Button>
          <span>{pagina + 1} / {paginas}</span>
          <Button size="sm" variant="ghost" disabled={pagina + 1 >= paginas || aCarregar} onClick={() => setPagina((p) => p + 1)} aria-label="Seguintes"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <DocumentoDoKanGest id={aberto} onAbrir={setAberto} onFechar={() => setAberto(null)} />
    </section>
  );
}

/**
 * Um documento, como no KanGest: o talão ou o A4 (o formato fica lembrado neste navegador), a 2.ª via e a impressão.
 * O documento de origem e os que saíram dele abrem-se daqui.
 */
export function DocumentoDoKanGest({ id, onAbrir, onFechar }) {
  const { user } = useAuth();
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState('');
  const [formato, setFormato] = useState(() => {
    try { return localStorage.getItem(FORMATO_KEY) === 'a4' ? 'a4' : 'talao'; } catch { return 'talao'; }
  });
  const papel = useRef(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    setResposta(null);
    setErro('');
    try {
      setResposta(await kangestDocumento(id));
    } catch (e) {
      setErro(e?.message || 'Não foi possível abrir o documento.');
    }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const d = useMemo(() => (resposta ? montarDocumento(resposta) : null), [resposta]);
  // a hora da reimpressão é a de quando se abriu o documento
  const reimpressao = useMemo(() => (resposta ? textoReimpressao(user?.name || user?.email || '') : ''), [user, resposta]);
  const escolher = (f) => {
    setFormato(f);
    try { localStorage.setItem(FORMATO_KEY, f); } catch { /* sem armazenamento */ }
  };
  const imprimir = () => {
    if (!papel.current || !d) return;
    imprimirElemento(papel.current.firstElementChild, { titulo: nomeDoDocumento(d), pagina: PAGINAS[formato] });
  };

  return (
    <Dialog open={!!id} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" aria-hidden="true" />{d ? `${d.documento.tipo_desc} ${d.documento.numero_doc}` : 'Documento do KanGest'}</DialogTitle>
          <DialogDescription>
            {d ? [d.loja?.name, d.posto?.nome && `posto ${d.posto.nome}`, d.documento.importado && 'histórico do KIGEST'].filter(Boolean).join(' · ') : 'A abrir…'}
          </DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        {!d && !erro && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="A carregar" /></div>}
        {d && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Formato">
                {[['talao', 'Talão 80 mm'], ['a4', 'A4']].map(([f, nome]) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={formato === f}
                    onClick={() => escolher(f)}
                    className={`rounded-md px-3 py-1 text-sm ${formato === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {nome}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={imprimir}><Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />Imprimir 2.ª via</Button>
              {d.origem && (
                <Button size="sm" variant="ghost" onClick={() => onAbrir(d.origem.id)}>Origem: {d.origem.numero_doc}</Button>
              )}
              {d.derivados.map((x) => (
                <Button key={x.id} size="sm" variant="ghost" onClick={() => onAbrir(x.id)}>
                  {x.numero_doc}{x.estado === 'A' ? ' (anulado)' : ''}
                </Button>
              ))}
            </div>
            {(!d.completo || !d.empresa) && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {!d.completo && 'Este documento chegou de um KanGest antes da 1.4.11: os pagamentos, o troco e as unidades não vieram. '}
                {!d.empresa && 'Os dados da empresa (o nome, o NIF, a morada e o logótipo) chegam com as configurações do posto.'}
              </p>
            )}
            <div className="overflow-x-auto rounded-lg bg-neutral-200 p-3 dark:bg-neutral-800" ref={papel}>
              {formato === 'a4'
                ? <FolhaA4 d={d} via="2.ª via" reimpressao={reimpressao} />
                : <Talao d={d} via="2.ª via" reimpressao={reimpressao} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
