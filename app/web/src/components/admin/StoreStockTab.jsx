import React, { useEffect, useMemo, useState } from 'react';
import { Check, Store, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PRODUCT_TYPES, productTypeLabel } from '@/lib/productTypes';
import {
  ESTADOS, contagens, estadoDe, filtrarProdutos, lojasQuePossoMarcar, marcar, marcasDaLoja, produtoComStock,
} from '@/lib/storeStock';
import { NativeSelect, Pill, SearchBox, Spinner, Toolbar } from '@/components/admin/igreja/registryUi';
import { cn } from '@/lib/utils';

const LOJA_GUARDADA = 'disponibilidade:loja';
const POR_PAGINA = 100;

/**
 * Disponibilidade nas lojas: cada loja marca os produtos que tem («temos») e os que não tem
 * («não temos»). O site mostra na página de cada produto as lojas que o têm, e no levantamento
 * deixa de oferecer a loja que disse «não temos» a algum livro do carrinho.
 *
 * Quem gere o catálogo marca qualquer loja; quem tem «Stock da loja» marca a sua (a loja da ficha
 * de funcionário ligada à conta). A regra está na base de dados (store_stock_set).
 */
export default function StoreStockTab() {
  const { toast } = useToast();
  const [lojas, setLojas] = useState(null);
  const [lojaId, setLojaId] = useState(() => {
    try { return localStorage.getItem(LOJA_GUARDADA) || ''; } catch { return ''; }
  });
  const [produtos, setProdutos] = useState([]);
  const [marcas, setMarcas] = useState(() => new Map());
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const [procura, setProcura] = useState('');
  const [estado, setEstado] = useState('todos');
  const [tipo, setTipo] = useState('');
  const [seleccao, setSeleccao] = useState(() => new Set());
  const [aGuardar, setAGuardar] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [ls, res] = await Promise.all([
          lojasQuePossoMarcar(),
          supabase.from('stock_books')
            .select('id, title, author, book_code, sku, cover, product_type, active, digital, versions')
            .order('title'),
        ]);
        if (res.error) throw new Error(res.error.message);
        if (!vivo) return;
        setProdutos((res.data || []).filter(produtoComStock));
        setLojas(ls);
        setLojaId((actual) => (ls.some((l) => l.id === actual) ? actual : ls[0]?.id || ''));
      } catch (e) {
        if (vivo) { setErro(e.message || 'Não foi possível carregar.'); setLojas([]); }
      }
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!lojaId) return undefined;
    let vivo = true;
    setACarregar(true);
    setSeleccao(new Set());
    setMarcas(new Map());
    marcasDaLoja(lojaId)
      .then((m) => { if (vivo) setMarcas(m); })
      .catch((e) => { if (vivo) setErro(e.message); })
      .finally(() => { if (vivo) setACarregar(false); });
    try { localStorage.setItem(LOJA_GUARDADA, lojaId); } catch { /* sem localStorage: fica só nesta visita */ }
    return () => { vivo = false; };
  }, [lojaId]);

  useEffect(() => { setLimite(POR_PAGINA); }, [procura, estado, tipo, lojaId]);

  const visiveis = useMemo(() => filtrarProdutos(produtos, marcas, { procura, estado, tipo }), [produtos, marcas, procura, estado, tipo]);
  const n = useMemo(() => contagens(produtos, marcas), [produtos, marcas]);
  const loja = lojas?.find((l) => l.id === lojaId);
  const todosVisiveisSeleccionados = visiveis.length > 0 && visiveis.every((p) => seleccao.has(p.id));

  // Marca já no ecrã e desfaz se a base de dados recusar.
  const aplicar = async (ids, valor) => {
    if (!ids.length || !lojaId) return false;
    const antes = marcas;
    setMarcas((m) => {
      const novo = new Map(m);
      ids.forEach((id) => (valor === null ? novo.delete(id) : novo.set(id, valor)));
      return novo;
    });
    setAGuardar(true);
    try {
      await marcar(lojaId, ids, valor);
      return true;
    } catch (e) {
      setMarcas(antes);
      toast({ variant: 'destructive', title: 'Não foi possível guardar', description: e.message });
      return false;
    } finally {
      setAGuardar(false);
    }
  };

  // Carregar no botão que já está marcado volta a «por marcar».
  const alternar = (p, valor) => {
    const actual = estadoDe(marcas, p.id);
    aplicar([p.id], actual === (valor ? 'temos' : 'nao-temos') ? null : valor);
  };

  const emLote = async (valor) => {
    const ids = [...seleccao];
    if (await aplicar(ids, valor)) {
      const texto = valor === null ? 'por marcar' : valor ? '«temos»' : '«não temos»';
      toast({ title: `${ids.length} produto${ids.length === 1 ? '' : 's'}: ${texto}` });
      setSeleccao(new Set());
    }
  };

  const seleccionarVisiveis = (v) => setSeleccao((s) => {
    const novo = new Set(s);
    visiveis.forEach((p) => (v ? novo.add(p.id) : novo.delete(p.id)));
    return novo;
  });

  if (lojas === null) return <Spinner />;

  if (!lojas.length) {
    return (
      <div className="rounded-xl border border-border p-6 text-sm">
        {erro ? (
          <p className="text-destructive">{erro}</p>
        ) : (
          <>
            <p className="font-medium">A sua conta ainda não está ligada a nenhuma loja.</p>
            <p className="mt-2 text-muted-foreground">
              Para marcar o stock de uma loja, a sua ficha de funcionário tem de ter a loja e estar ligada à sua conta
              (Pessoal → Funcionários). Peça a quem gere os funcionários.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 sm:flex-none">
          <label htmlFor="disponibilidade-loja" className="mb-1 block text-xs font-medium text-muted-foreground">Loja</label>
          {lojas.length > 1 ? (
            <NativeSelect id="disponibilidade-loja" value={lojaId} onChange={setLojaId} className="sm:w-72">
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? '' : ' (inactiva)'}</option>)}
            </NativeSelect>
          ) : (
            <p id="disponibilidade-loja" className="flex h-9 items-center gap-2 text-sm font-medium"><Store className="h-4 w-4 text-primary" />{loja?.name}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
          {Object.entries(ESTADOS).map(([k, e]) => (
            <button
              key={k}
              type="button"
              onClick={() => setEstado(estado === k ? 'todos' : k)}
              aria-pressed={estado === k}
              className={cn('rounded-full ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring', estado === k && 'ring-2 ring-primary')}
            >
              <Pill tone={e.tone}>{e.label}: {aCarregar ? '…' : n[k]}</Pill>
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        A página de cada produto mostra as lojas que o têm. No levantamento, a loja que disse «não temos» a algum livro
        do carrinho deixa de se poder escolher. «Por marcar» nunca aparece como «não temos».
      </p>

      <Toolbar>
        <SearchBox value={procura} onChange={setProcura} placeholder="Título, autor ou código…" />
        <NativeSelect value={estado} onChange={setEstado} className="sm:w-40" aria-label="Estado">
          <option value="todos">Todos ({n.total})</option>
          {Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.label} ({n[k]})</option>)}
        </NativeSelect>
        <NativeSelect value={tipo} onChange={setTipo} className="sm:w-56" aria-label="Tipo de produto">
          <option value="">Todos os tipos</option>
          {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.plural}</option>)}
        </NativeSelect>
      </Toolbar>

      {seleccao.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-background/95 p-3 shadow-sm backdrop-blur">
          <span className="text-sm font-medium">{seleccao.size} seleccionado{seleccao.size === 1 ? '' : 's'}</span>
          <Button size="sm" onClick={() => emLote(true)} disabled={aGuardar}><Check className="mr-1 h-4 w-4" />Temos</Button>
          <Button size="sm" variant="outline" onClick={() => emLote(false)} disabled={aGuardar}><X className="mr-1 h-4 w-4" />Não temos</Button>
          <Button size="sm" variant="ghost" onClick={() => emLote(null)} disabled={aGuardar}>Por marcar</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSeleccao(new Set())}>Limpar a selecção</Button>
        </div>
      )}

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Checkbox
            aria-label="Seleccionar todos os da lista"
            checked={todosVisiveisSeleccionados}
            onCheckedChange={(v) => seleccionarVisiveis(!!v)}
            disabled={!visiveis.length}
          />
          <span className="flex-1">{visiveis.length} produto{visiveis.length === 1 ? '' : 's'}</span>
          <span className="hidden sm:inline">Nesta loja</span>
        </div>
        {!visiveis.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum produto com estes filtros.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visiveis.slice(0, limite).map((p) => {
              const est = estadoDe(marcas, p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 sm:flex-nowrap">
                  <Checkbox
                    aria-label={`Seleccionar ${p.title}`}
                    checked={seleccao.has(p.id)}
                    onCheckedChange={(v) => setSeleccao((s) => {
                      const novo = new Set(s);
                      if (v) novo.add(p.id); else novo.delete(p.id);
                      return novo;
                    })}
                  />
                  <div className="h-12 w-9 shrink-0 overflow-hidden rounded border bg-muted">
                    {p.cover ? <img src={p.cover} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {p.book_code && <span className="font-mono">{p.book_code}</span>}
                      <span>{productTypeLabel(p.product_type)}</span>
                      {!p.active && <Pill tone="amber">Oculto no site</Pill>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1" role="group" aria-label={`Stock de ${p.title} nesta loja`}>
                    <Button
                      size="sm"
                      variant={est === 'temos' ? 'default' : 'outline'}
                      aria-pressed={est === 'temos'}
                      className={cn(est === 'temos' && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                      onClick={() => alternar(p, true)}
                      disabled={aGuardar || aCarregar}
                    >
                      <Check className="mr-1 h-4 w-4" />Temos
                    </Button>
                    <Button
                      size="sm"
                      variant={est === 'nao-temos' ? 'default' : 'outline'}
                      aria-pressed={est === 'nao-temos'}
                      className={cn(est === 'nao-temos' && 'bg-red-600 text-white hover:bg-red-700')}
                      onClick={() => alternar(p, false)}
                      disabled={aGuardar || aCarregar}
                    >
                      <X className="mr-1 h-4 w-4" />Não temos
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {visiveis.length > limite && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimite((l) => l + POR_PAGINA)}>
            Mostrar mais ({visiveis.length - limite})
          </Button>
        </div>
      )}
    </div>
  );
}
