import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ImagePlus, Images, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AdminViewNav, useSectionView } from '@/components/admin/shell/AdminViewNav';
import { ALLOWED_IMAGE_ACCEPT } from '@/lib/imageTypes';
import { kwanza } from '@/lib/money';
import { listStores } from '@/painel-vendas/adapter';
import { MESES } from '@/painel-vendas/modelo';
import { NOMES_TEMAS, TEMAS, desenharPaisagem } from '@/painel-vendas/imagens-video';
import {
  TEMAS_IMAGENS, actualizarImagem, apagarImagem, apagarMaisVendido, enviarImagem, gravarMaisVendido,
  imagensDoSite, juntarDoSite, listarImagens, listarMaisVendidos, maisVendidosDoSistema, procurarProdutos,
} from '@/painel-vendas/biblioteca';

const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm';

/**
 * Relatórios › Imagens dos vídeos (docs/RELATORIOS.md, §5):
 *  · Biblioteca de imagens: as fotografias que os vídeos usam de fundo quando se escolhe
 *    «Fotografias da biblioteca» no menu Exportar (as paisagens desenhadas não precisam de nada).
 *  · Mais vendidos: os de cada loja lançados à mão — as vendas do balcão, que o site não vê.
 * Ver: «Ver relatórios», «Editar relatórios de vendas» ou «Gerir catálogo» (só a biblioteca).
 * Gerir a biblioteca: «Editar relatórios de vendas» ou «Gerir catálogo». Lançar: «Editar relatórios».
 */
export default function ImagensVideosTab() {
  const sv = useSectionView('imagens-videos');
  return (
    <div className="space-y-4">
      <AdminViewNav state={sv} className="mb-0" />
      <div className="pt-2">{sv.view === 'mais-vendidos' ? <MaisVendidosPanel /> : <BibliotecaPanel />}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------------------------
function Paisagem({ tema }) {
  const ref = useRef(null);
  const anima = useRef(0);
  // Desenha em 1280×720 (o tamanho do vídeo) e mostra pequeno. Parada; com o rato por cima, mexe.
  const desenhar = (t) => { const c = ref.current; if (c) desenharPaisagem(c.getContext('2d'), 1280, 720, tema, t); };
  useEffect(() => { desenhar(3); return () => window.clearTimeout(anima.current); }, [tema]); // eslint-disable-line react-hooks/exhaustive-deps
  const mexer = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let t = 3;
    const passo = () => { desenhar(t); t += 1 / 12; anima.current = window.setTimeout(passo, 1000 / 12); };
    passo();
  };
  const parar = () => window.clearTimeout(anima.current);
  return (
    <figure className="space-y-1" onMouseEnter={mexer} onMouseLeave={parar}>
      <canvas ref={ref} width={1280} height={720} className="aspect-video w-full rounded-lg border border-border" role="img" aria-label={`Paisagem: ${NOMES_TEMAS[tema]}`} />
      <figcaption className="text-xs text-muted-foreground">{NOMES_TEMAS[tema]} · passe o rato para ver o movimento</figcaption>
    </figure>
  );
}

function BibliotecaPanel() {
  const { toast } = useToast();
  const { isAdmin, hasPermission } = useAuth();
  const podeGerir = isAdmin || hasPermission('edit_reports') || hasPermission('manage_catalog');
  const [imagens, setImagens] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [temaEnvio, setTemaEnvio] = useState('natureza');
  const [creditos, setCreditos] = useState('');
  const [aEnviar, setAEnviar] = useState('');
  const [site, setSite] = useState(null);
  const [escolhidas, setEscolhidas] = useState({});
  const ficheiro = useRef(null);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try { setImagens(await listarImagens()); setErro(''); } catch (e) { setErro(e.message); } finally { setACarregar(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const mostradas = useMemo(() => (filtro === 'todas' ? imagens : imagens.filter((i) => i.tema === filtro)), [imagens, filtro]);
  const activas = imagens.filter((i) => i.activa).length;

  const enviar = async (lista) => {
    const files = [...(lista || [])];
    if (!files.length) return;
    let ok = 0;
    for (const [n, f] of files.entries()) {
      setAEnviar(`A enviar ${n + 1} de ${files.length}…`);
      try { await enviarImagem(f, { tema: temaEnvio, creditos }); ok++; } catch (e) { toast({ title: f.name, description: e.message, variant: 'destructive' }); }
    }
    setAEnviar('');
    if (ficheiro.current) ficheiro.current.value = '';
    if (ok) toast({ title: `${ok} ${ok === 1 ? 'imagem juntada' : 'imagens juntadas'} à biblioteca` });
    carregar();
  };

  const abrirSite = async () => {
    setSite([]);
    try {
      const ja = new Set(imagens.map((i) => i.url));
      setSite((await imagensDoSite()).filter((x) => !ja.has(x.url)));
    } catch (e) { setSite(null); toast({ title: 'Imagens do site', description: e.message, variant: 'destructive' }); }
    setEscolhidas({});
  };
  const juntarEscolhidas = async () => {
    const lista = (site || []).filter((x) => escolhidas[x.url]);
    try {
      await juntarDoSite(lista);
      toast({ title: `${lista.length} ${lista.length === 1 ? 'imagem juntada' : 'imagens juntadas'} à biblioteca` });
      setSite(null);
      carregar();
    } catch (e) { toast({ title: 'Não foi possível juntar', description: e.message, variant: 'destructive' }); }
  };

  const alterar = async (img, campos) => {
    setImagens((l) => l.map((x) => (x.id === img.id ? { ...x, ...campos } : x)));
    try { await actualizarImagem(img.id, campos); } catch (e) { toast({ title: 'Não foi possível alterar', description: e.message, variant: 'destructive' }); carregar(); }
  };
  const apagar = async (img) => {
    if (!window.confirm(`Tirar «${img.titulo || 'esta imagem'}» da biblioteca?${img.caminho ? ' O ficheiro enviado também é apagado.' : ''}`)) return;
    try { await apagarImagem(img); setImagens((l) => l.filter((x) => x.id !== img.id)); } catch (e) { toast({ title: 'Não foi possível apagar', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <div>
          <h2 className="text-base font-semibold">Paisagens desenhadas no vídeo</h2>
          <p className="text-sm text-muted-foreground">
            O fundo de omissão dos vídeos («Paisagens animadas» no menu Exportar). São desenhadas pelo próprio vídeo, com movimento: não precisam de ser enviadas.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TEMAS.map((t) => <Paisagem key={t} tema={t} />)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Fotografias da biblioteca</h2>
            <p className="text-sm text-muted-foreground">
              Com «Fotografias da biblioteca» no menu Exportar, os vídeos usam as activas, primeiro as de natureza, com um zoom lento. {activas} {activas === 1 ? 'activa' : 'activas'}.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}><RefreshCw className="mr-1.5 h-4 w-4" /> Actualizar</Button>
        </div>

        {podeGerir && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="bi-tema">Tema</Label>
              <select id="bi-tema" className={selectCls} value={temaEnvio} onChange={(e) => setTemaEnvio(e.target.value)}>
                {Object.entries(TEMAS_IMAGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="min-w-[14rem] flex-1 space-y-1">
              <Label htmlFor="bi-creditos">Créditos <span className="font-normal text-muted-foreground">(quem tirou, licença)</span></Label>
              <Input id="bi-creditos" value={creditos} maxLength={300} onChange={(e) => setCreditos(e.target.value)} placeholder="Ex.: Fotografia da equipa do Lubango" />
            </div>
            <input ref={ficheiro} type="file" accept={ALLOWED_IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
            <Button onClick={() => ficheiro.current?.click()} disabled={!!aEnviar}>
              {aEnviar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
              {aEnviar || 'Enviar fotografias'}
            </Button>
            <Button variant="outline" onClick={abrirSite}><Images className="mr-1.5 h-4 w-4" /> Juntar imagens do site</Button>
            <p className="w-full text-xs text-muted-foreground">PNG, JPG, WebP ou GIF até 8 MB. As largas (paisagem, 16:9) enchem melhor o vídeo; as estreitas ficam cortadas.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tema">
          {[['todas', 'Todas'], ...Object.entries(TEMAS_IMAGENS)].map(([k, v]) => (
            <Button key={k} size="sm" variant={filtro === k ? 'default' : 'outline'} className="h-8" onClick={() => setFiltro(k)}>
              {v} <span className="ml-1 opacity-70">{k === 'todas' ? imagens.length : imagens.filter((i) => i.tema === k).length}</span>
            </Button>
          ))}
        </div>

        {erro && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{erro}</p>}
        {aCarregar && !imagens.length ? (
          <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !mostradas.length && !erro ? (
          <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            Ainda não há imagens {filtro === 'todas' ? 'na biblioteca' : 'deste tema'}. {podeGerir ? 'Envie fotografias ou junte as do site.' : ''}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mostradas.map((img) => {
              const estreita = img.largura && img.altura && img.largura / img.altura < 1.3;
              return (
                <li key={img.id} className={`space-y-2 rounded-xl border border-border p-2 ${img.activa ? '' : 'opacity-60'}`}>
                  <div className="relative">
                    <img src={img.url} alt="" loading="lazy" className="aspect-video w-full rounded-lg border border-border object-cover" />
                    {estreita && <span className="absolute left-2 top-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-black">Estreita: fica cortada</span>}
                  </div>
                  <Input aria-label="Título" defaultValue={img.titulo} maxLength={120} disabled={!podeGerir} placeholder="Título"
                    onBlur={(e) => { if (e.target.value !== img.titulo) alterar(img, { titulo: e.target.value }); }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Tema" className={selectCls} value={img.tema} disabled={!podeGerir} onChange={(e) => alterar(img, { tema: e.target.value })}>
                      {Object.entries(TEMAS_IMAGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={img.activa} disabled={!podeGerir} onCheckedChange={(v) => alterar(img, { activa: v })} aria-label="Usar nos vídeos" />
                      Usar nos vídeos
                    </label>
                    {podeGerir && (
                      <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive" onClick={() => apagar(img)} aria-label="Tirar da biblioteca"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <Input aria-label="Créditos" defaultValue={img.creditos} maxLength={300} disabled={!podeGerir} placeholder="Créditos (quem tirou, licença)" className="h-8 text-xs"
                    onBlur={(e) => { if (e.target.value !== img.creditos) alterar(img, { creditos: e.target.value }); }} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={site != null} onOpenChange={(o) => { if (!o) setSite(null); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Juntar imagens do site</DialogTitle>
            <DialogDescription>As composições feitas com as capas do catálogo (tema Livros) e as fotografias das lojas (tema Lojas). Já estão no site: não se envia nada.</DialogDescription>
          </DialogHeader>
          {site && !site.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Não há mais imagens do site para juntar.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(site || []).map((x) => (
                <li key={x.url}>
                  <label className={`block cursor-pointer space-y-1 rounded-lg border p-1.5 ${escolhidas[x.url] ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
                    <input type="checkbox" className="sr-only" checked={!!escolhidas[x.url]} onChange={(e) => setEscolhidas((s) => ({ ...s, [x.url]: e.target.checked }))} />
                    <img src={x.mini} alt="" loading="lazy" className="aspect-video w-full rounded object-cover" />
                    <span className="block truncate text-xs">{x.titulo}</span>
                    <span className="block text-[11px] text-muted-foreground">{TEMAS_IMAGENS[x.tema]}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSite(null)}>Cancelar</Button>
            <Button onClick={juntarEscolhidas} disabled={!Object.values(escolhidas).some(Boolean)}>
              Juntar {Object.values(escolhidas).filter(Boolean).length || ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Mais vendidos à mão
// ---------------------------------------------------------------------------------------------
const vazio = { titulo: '', book_id: null, unidades: '', valor: '', nota: '' };

function MaisVendidosPanel() {
  const { toast } = useToast();
  const { isAdmin, hasPermission } = useAuth();
  const podeLancar = isAdmin || hasPermission('edit_reports');
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState('');
  const [linhas, setLinhas] = useState([]);
  const [sistema, setSistema] = useState(null);
  const [aCarregar, setACarregar] = useState(false);
  const [novo, setNovo] = useState(vazio);
  const [procura, setProcura] = useState([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    listStores().then((l) => { setLojas(l); if (l.length) setLoja((x) => x || l[0].id); });
  }, []);

  const carregar = useCallback(async () => {
    if (!loja || !ano) return;
    setACarregar(true);
    try {
      const [l, s] = await Promise.all([listarMaisVendidos(loja, ano), maisVendidosDoSistema(loja, ano, mes)]);
      setLinhas(l); setSistema(s); setErro('');
    } catch (e) { setErro(e.message); } finally { setACarregar(false); }
  }, [loja, ano, mes]);
  useEffect(() => { carregar(); }, [carregar]);

  const doPeriodo = linhas.filter((r) => (mes ? Number(r.mes) === Number(mes) : r.mes == null));
  const periodo = mes ? `${MESES[mes - 1]} de ${ano}` : `o ano de ${ano}`;

  useEffect(() => {
    const t = novo.titulo.trim();
    if (novo.book_id || t.length < 2) { setProcura([]); return undefined; }
    const id = setTimeout(() => procurarProdutos(t).then(setProcura).catch(() => setProcura([])), 250);
    return () => clearTimeout(id);
  }, [novo.titulo, novo.book_id]);

  const juntar = async (linha) => {
    try {
      await gravarMaisVendido({ ...linha, loja_id: loja, ano, mes: mes || null });
      setNovo(vazio);
      carregar();
    } catch (e) { toast({ title: 'Não foi possível gravar', description: e.message, variant: 'destructive' }); }
  };
  const copiarSistema = async (lista) => {
    try {
      for (const r of lista) await gravarMaisVendido({ loja_id: loja, ano, mes: mes || null, book_id: r.book_id, titulo: r.titulo, unidades: r.unidades, valor: r.valor, nota: 'copiado das encomendas do site' });
      toast({ title: `${lista.length} ${lista.length === 1 ? 'produto copiado' : 'produtos copiados'}` });
      carregar();
    } catch (e) { toast({ title: 'Não foi possível copiar', description: e.message, variant: 'destructive' }); }
  };
  const alterar = async (r, campos) => {
    try { await gravarMaisVendido({ ...r, ...campos }); carregar(); } catch (e) { toast({ title: 'Não foi possível gravar', description: e.message, variant: 'destructive' }); }
  };
  const apagar = async (r) => {
    try { await apagarMaisVendido(r.id); carregar(); } catch (e) { toast({ title: 'Não foi possível apagar', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Os mais vendidos de cada loja aparecem nos vídeos (o mais vendido do ano em 3D, os cinco mais vendidos e o de cada mês).
        Vêm das encomendas do site; as vendas do balcão lançam-se aqui. <b>O que se lança para um período substitui o site nesse período</b>, nessa loja.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="mv-loja">Loja</Label>
          <select id="mv-loja" className={selectCls} value={loja} onChange={(e) => setLoja(e.target.value)}>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? '' : ' (inactiva)'}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-ano">Ano</Label>
          <Input id="mv-ano" type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(Number(e.target.value) || '')} className="h-9 w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-mes">Período</Label>
          <select id="mv-mes" className={selectCls} value={mes} onChange={(e) => setMes(e.target.value ? Number(e.target.value) : '')}>
            <option value="">O ano todo</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}><RefreshCw className="mr-1.5 h-4 w-4" /> Actualizar</Button>
      </div>
      {erro && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-xl border border-border p-4">
          <h2 className="text-base font-semibold">Lançados à mão · {periodo}</h2>
          {!doPeriodo.length ? (
            <p className="text-sm text-muted-foreground">Nada lançado para {periodo}: o vídeo usa as encomendas do site.</p>
          ) : (
            <ul className="divide-y divide-border">
              {doPeriodo.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-6 text-right text-sm font-semibold text-muted-foreground">{i + 1}º</span>
                  <span className="min-w-[10rem] flex-1 text-sm font-medium">{r.titulo}{r.book_id ? '' : <span className="ml-1 text-xs text-muted-foreground">(fora do catálogo: sem capa)</span>}</span>
                  <Input aria-label="Unidades" type="number" min={0} step="1" defaultValue={r.unidades} disabled={!podeLancar} className="h-8 w-24"
                    onBlur={(e) => { if (Number(e.target.value) !== Number(r.unidades)) alterar(r, { unidades: e.target.value }); }} />
                  <Input aria-label="Valor em Kz" type="number" min={0} step="0.01" defaultValue={r.valor ?? ''} placeholder="Kz" disabled={!podeLancar} className="h-8 w-32"
                    onBlur={(e) => { if (String(e.target.value) !== String(r.valor ?? '')) alterar(r, { valor: e.target.value }); }} />
                  {podeLancar && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => apagar(r)} aria-label={`Apagar ${r.titulo}`}><Trash2 className="h-4 w-4" /></Button>}
                </li>
              ))}
            </ul>
          )}
          {podeLancar && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <div className="relative">
                <Label htmlFor="mv-titulo">Produto</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="mv-titulo" className="pl-8" value={novo.titulo} maxLength={200} placeholder="Escreva o título ou o código"
                    onChange={(e) => setNovo((n) => ({ ...n, titulo: e.target.value, book_id: null }))} />
                </div>
                {procura.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                    {procura.map((b) => (
                      <li key={b.id}>
                        <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                          onClick={() => { setNovo((n) => ({ ...n, titulo: b.title, book_id: b.id })); setProcura([]); }}>
                          {b.cover ? <img src={b.cover} alt="" className="h-9 w-6 rounded-sm object-cover" /> : <span className="h-9 w-6 rounded-sm bg-muted" />}
                          <span className="flex-1">{b.title}</span>
                          <span className="text-xs text-muted-foreground">{b.book_code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {novo.book_id && <p className="mt-1 text-xs text-emerald-600">Do catálogo: o vídeo mostra a capa.</p>}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label htmlFor="mv-unid">Unidades</Label><Input id="mv-unid" type="number" min={0} step="1" value={novo.unidades} onChange={(e) => setNovo((n) => ({ ...n, unidades: e.target.value }))} className="h-9 w-24" /></div>
                <div className="space-y-1"><Label htmlFor="mv-valor">Valor (Kz) <span className="font-normal text-muted-foreground">opcional</span></Label><Input id="mv-valor" type="number" min={0} step="0.01" value={novo.valor} onChange={(e) => setNovo((n) => ({ ...n, valor: e.target.value }))} className="h-9 w-36" /></div>
                <div className="min-w-[10rem] flex-1 space-y-1"><Label htmlFor="mv-nota">Nota <span className="font-normal text-muted-foreground">opcional</span></Label><Input id="mv-nota" value={novo.nota} maxLength={300} onChange={(e) => setNovo((n) => ({ ...n, nota: e.target.value }))} placeholder="Ex.: do KiGest" className="h-9" /></div>
                <Button onClick={() => juntar(novo)} disabled={!novo.titulo.trim() || !(Number(novo.unidades) > 0)}><Plus className="mr-1.5 h-4 w-4" /> Juntar</Button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">No site · {periodo}</h2>
              <p className="text-xs text-muted-foreground">Encomendas pagas desta loja (levantamentos e entregas na província).</p>
            </div>
            {podeLancar && sistema && sistema.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => copiarSistema(sistema.slice(0, 5))}><Copy className="mr-1.5 h-4 w-4" /> Copiar os 5</Button>
            )}
          </div>
          {sistema == null ? (
            <p className="text-sm text-muted-foreground">As vendas por produto ficam disponíveis depois de aplicada a migração «imagens_e_mais_vendidos_dos_videos».</p>
          ) : !sistema.length ? (
            <p className="text-sm text-muted-foreground">Sem vendas no site para {periodo}.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {sistema.map((r, i) => (
                <li key={(r.book_id || r.titulo) + i} className="flex items-baseline gap-2">
                  <span className="w-6 text-right font-semibold text-muted-foreground">{i + 1}º</span>
                  <span className="flex-1">{r.titulo}</span>
                  <span className="whitespace-nowrap font-medium tabular-nums">{r.unidades} un.</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{kwanza(r.valor)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
