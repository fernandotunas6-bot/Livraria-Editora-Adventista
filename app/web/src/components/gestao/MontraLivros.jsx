import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, WifiOff } from 'lucide-react';
import { getFeaturedProducts, getProducts } from '@/api/EcommerceApi';
import { buildShowcaseCategories } from '@/lib/catalogCategories';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { estiloDaPassagem, lerMontra, livroDaMontra, quadrosDaMontra, sequenciaTv, temasDaMontra } from '@/lib/painelGestao';
import { ESTILO, LeitorPublicidade, PASSAGEM_MS } from '@/components/gestao/PublicidadeTv';
import { MARCA } from '@/components/gestao/marca';

// ------------------------------------------------------------------ configuração (cada TV a sua)

const GUARDA = 'painel-gestao-tv-montra';
const GUARDA_LIVROS = 'painel-gestao-tv-montra-livros';

export function useConfigMontra() {
  const [cfg, setCfg] = useState(() => {
    try {
      return lerMontra(localStorage.getItem(GUARDA));
    } catch {
      return lerMontra(null);
    }
  });
  const mudar = useCallback((parte) => setCfg((c) => {
    const novo = { ...c, ...parte };
    try { localStorage.setItem(GUARDA, JSON.stringify(novo)); } catch { /* só nesta sessão */ }
    return novo;
  }), []);
  return [cfg, mudar];
}

// ------------------------------------------------------------------ a internet desta TV

/**
 * 'ok' ou 'sem': um pedido pequeno à base de 30 em 30 segundos (de 15 em 15 quando falha). Passa a «sem» com o
 * browser sem rede ou ao fim de duas falhas (ou respostas de mais de 5 s) seguidas, e volta a «ok» só depois de
 * duas boas seguidas — uma rede que vai e vem não faz a TV saltar entre a publicidade e a montra. Uma resposta do
 * servidor, mesmo a recusar (sessão expirada, sem permissão), quer dizer que a internet está lá: só a falta de
 * resposta (status 0), um erro do servidor (5xx) ou a demora contam como falha.
 */
export function useInternet() {
  const [estado, setEstado] = useState(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'sem' : 'ok'));
  useEffect(() => {
    let vivo = true;
    let falhas = 0;
    let boas = 0;
    let t = null;
    const testar = async () => {
      clearTimeout(t);
      let bom = false;
      if (navigator.onLine !== false) {
        const t0 = performance.now();
        try {
          const ctl = new AbortController();
          const corta = setTimeout(() => ctl.abort(), 8000);
          const { status } = await supabase.from('painel_tv_midia').select('id', { head: true, count: 'exact' }).limit(1).abortSignal(ctl.signal);
          clearTimeout(corta);
          bom = status >= 200 && status < 500 && performance.now() - t0 < 5000;
        } catch {
          bom = false;
        }
      }
      if (!vivo) return;
      if (bom) { boas++; falhas = 0; } else { falhas++; boas = 0; }
      if (falhas >= 2 || navigator.onLine === false) setEstado('sem');
      if (boas >= 2) setEstado('ok');
      t = setTimeout(testar, falhas ? 15_000 : 30_000);
    };
    const desligou = () => { falhas = 2; boas = 0; setEstado('sem'); };
    window.addEventListener('offline', desligou);
    window.addEventListener('online', testar);
    testar();
    return () => {
      vivo = false;
      clearTimeout(t);
      window.removeEventListener('offline', desligou);
      window.removeEventListener('online', testar);
    };
  }, []);
  return estado;
}

// ------------------------------------------------------------------ os livros (e as capas guardadas para sem internet)

const capas = new Map(); // url → blob: (fica na memória da página enquanto a TV estiver ligada)
let memoria = null;

async function guardarCapas(urls) {
  for (const u of urls) {
    if (!u || capas.has(u)) continue;
    try {
      const r = await fetch(u, { mode: 'cors', cache: 'force-cache' });
      if (!r.ok) throw new Error(String(r.status));
      capas.set(u, URL.createObjectURL(await r.blob()));
    } catch {
      // sem CORS ou sem rede: a imagem normal, que o browser também guarda
      const img = new Image();
      img.src = u;
      capas.set(u, u);
    }
  }
}
export const capaGuardada = (u) => capas.get(u) || u;

function lerGuardados() {
  try {
    const v = JSON.parse(localStorage.getItem(GUARDA_LIVROS) || 'null');
    return v && Array.isArray(v.destaques) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Os destaques e os temas do catálogo, como no site (EcommerceApi e catalogCategories), de 30 em 30 minutos.
 * Os títulos e preços ficam também no aparelho; as capas, na memória da página — sem internet, a montra continua.
 */
export function useLivrosMontra(fonte) {
  const [livros, setLivros] = useState(() => memoria || lerGuardados() || { destaques: [], temas: [] });
  const precisaTemas = fonte !== 'destaques';
  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      try {
        const [dest, todos] = await Promise.all([
          getFeaturedProducts(24),
          precisaTemas ? getProducts({}) : Promise.resolve(null),
        ]);
        const destaques = (dest?.products || []).map(livroDaMontra).filter(Boolean);
        const temas = todos ? temasDaMontra(buildShowcaseCategories(todos.products || [])) : (memoria?.temas || []);
        if (!vivo || (!destaques.length && !temas.length)) return;
        const novo = { destaques, temas };
        memoria = novo;
        setLivros(novo);
        try { localStorage.setItem(GUARDA_LIVROS, JSON.stringify(novo)); } catch { /* sem espaço: só na memória */ }
        await guardarCapas([...destaques, ...temas.flatMap((t) => t.livros)].map((l) => l.capa).slice(0, 80));
      } catch {
        // sem internet: fica o que já havia
      }
    };
    carregar();
    const t = setInterval(carregar, 30 * 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [precisaTemas]);
  return livros;
}

// ------------------------------------------------------------------ os quadros

function Capa({ livro, className, style }) {
  return (
    <img src={capaGuardada(livro.capa)} alt="" draggable="false"
      className={cn('rounded-md object-cover shadow-[0_25px_50px_-12px_rgba(0,0,0,.75)] ring-1 ring-white/15', className)} style={style} />
  );
}

function Preco({ livro, tamanho = 18, centro = false }) {
  if (!livro.preco) return null;
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3', centro && 'justify-center')}>
      <span className="font-mono font-black tabular-nums tracking-tight" style={{ color: '#f6d58a', fontSize: tamanho }}>{livro.preco}</span>
      {livro.precoAntigo && <span className="font-mono tabular-nums text-white/55 line-through" style={{ fontSize: Math.max(tamanho * 0.5, 11) }}>{livro.precoAntigo}</span>}
    </div>
  );
}

function Abertura({ q, logo }) {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden p-8 text-center"
      style={{ background: `radial-gradient(70% 60% at 50% 40%, ${MARCA.petroleo}, ${MARCA.petroleoProfundo} 70%, #021a21)` }}>
      <div className="montra-raio pointer-events-none absolute inset-0" />
      <div className="montra-sobe relative space-y-4">
        {logo && <img src={logo} alt="" className="mx-auto h-16 w-auto object-contain opacity-95" />}
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#fcefc7]">{q.subtitulo}</p>
        <p className="font-serif text-4xl font-semibold leading-tight text-white drop-shadow-lg sm:text-5xl">{q.titulo}</p>
        <span className="mx-auto block h-1 w-24 rounded-full" style={{ background: MARCA.ouro }} />
      </div>
    </div>
  );
}

function QuadroLivro({ q, caixa, precos, logo }) {
  const l = q.livro;
  const largo = caixa.w / Math.max(caixa.h, 1) > 1.15;
  const baixo = caixa.h < 380;
  // a capa e as letras à medida do espaço: a coluna da publicidade, por baixo dela o gráfico, ou o ecrã todo
  const altCapa = Math.round(largo ? Math.min(caixa.h - 56, 560) * 0.9 : Math.min(caixa.h * 0.44, caixa.w * 0.9 * 1.5));
  const tamTitulo = Math.round(Math.min(Math.max(caixa.h / (largo ? 12 : 16), 20), 46));
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* a capa ampliada e desfocada por trás, a andar devagar */}
      <img src={capaGuardada(l.capa)} alt="" className="montra-fundo absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[.38] saturate-150" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(115deg, ${MARCA.petroleoProfundo}ee 10%, ${MARCA.petroleoProfundo}88 55%, transparent)` }} />
      <div className={cn('relative flex h-full items-center', largo ? 'flex-row gap-8 px-8' : 'flex-col justify-center gap-4 px-6 text-center', baixo && 'gap-5')}>
        <div className="montra-capa shrink-0" style={{ perspective: 1200 }}>
          <Capa livro={l} style={{ height: altCapa, width: Math.round(altCapa / 1.5), transform: largo ? 'rotateY(8deg)' : 'none' }} />
        </div>
        <div className={cn('montra-sobe min-w-0', largo ? 'flex-1' : 'max-w-[92%]', baixo ? 'space-y-1.5' : 'space-y-3')}>
          {l.fita && (
            <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider', l.promocao ? 'bg-red-500 text-white' : 'text-[#3b2a00]')}
              style={l.promocao ? undefined : { background: '#f6d58a' }}>{l.fita}</span>
          )}
          <p className="line-clamp-3 font-serif font-semibold leading-tight text-white drop-shadow-lg" style={{ fontSize: tamTitulo }}>{l.titulo}</p>
          {l.autor && <p className="text-white/75" style={{ fontSize: Math.max(tamTitulo * 0.45, 13) }}>{l.autor}</p>}
          {precos && <Preco livro={l} tamanho={Math.round(tamTitulo * 0.95)} centro={!largo} />}
          {!baixo && <p className="text-sm text-white/60">Na livraria e em <b className="text-white/85">livrariaadventista.ao</b></p>}
        </div>
      </div>
      {logo && <img src={logo} alt="" className="absolute right-4 top-3 h-7 w-auto opacity-75" />}
    </div>
  );
}

function Prateleira({ q, precos, caixa }) {
  const n = caixa.w < 560 ? 3 : q.livros.length;
  const livros = q.livros.slice(0, n);
  // capas todas da mesma altura: cabem na largura e deixam espaço para o título e o preço
  const larg = Math.min((caixa.w - 64 - (n - 1) * 20) / n, 190, ((caixa.h - 150) * 0.62) / 1.5);
  const baixo = caixa.h < 380;
  return (
    <div className={cn('relative flex h-full w-full flex-col justify-center overflow-hidden px-8', baixo ? 'gap-3' : 'gap-6')}
      style={{ background: `linear-gradient(160deg, ${MARCA.petroleoProfundo}, #021a21)` }}>
      <div className="montra-sobe">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#fcefc7]">Do nosso catálogo</p>
        <p className={cn('font-serif font-semibold text-white', baixo ? 'text-2xl' : 'text-4xl')}>{q.titulo}</p>
      </div>
      <div className="flex items-start justify-center gap-5">
        {livros.map((l, k) => (
          <div key={l.id} className="montra-livro min-w-0 text-center" style={{ animationDelay: `${250 + k * 160}ms`, width: larg }}>
            <Capa livro={l} className="mx-auto" style={{ width: larg, height: larg * 1.5 }} />
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight text-white">{l.titulo}</p>
            {precos && <div className="mt-1"><Preco livro={l} centro /></div>}
          </div>
        ))}
      </div>
      {/* a prateleira por baixo das capas */}
      <span className="mx-auto -mt-3 block h-2 w-[92%] rounded-full opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${MARCA.ouro}, transparent)` }} />
    </div>
  );
}

const ESTILO_MONTRA = `
@keyframes montra-sobe{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes montra-capa{from{opacity:0;transform:translateX(-40px) scale(.94)}to{opacity:1;transform:none}}
@keyframes montra-fundo{from{transform:scale(1.25)}to{transform:scale(1.4) translate(-2%,-1%)}}
@keyframes montra-raio{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@keyframes montra-barra{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.montra-sobe{animation:montra-sobe .9s cubic-bezier(.2,.7,.2,1) .25s both}
.montra-capa{animation:montra-capa 1s cubic-bezier(.2,.7,.2,1) both}
.montra-livro{animation:montra-sobe .8s cubic-bezier(.2,.7,.2,1) both}
.montra-fundo{animation:montra-fundo 9s linear both}
.montra-raio{background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.08) 50%,transparent 70%);animation:montra-raio 2.6s ease-in-out .3s both}
@media (prefers-reduced-motion: reduce){.montra-sobe,.montra-capa,.montra-livro,.montra-fundo,.montra-raio{animation:none!important}}
`;

/**
 * A montra de livros (docs/PAINEL-GESTAO.md §6.14): uma passagem de `cfg.duracao` segundos com os destaques (ou os
 * temas do catálogo), com as transições da TV. `continuo`: passagem atrás de passagem (sem internet ou sem
 * publicidade); senão, chama `onFim` ao acabar. `semInternet`: mostra o aviso discreto.
 */
export function MontraLivros({ livros, cfg, transicao = 'esbater', logo, continuo = false, onFim, semInternet = false }) {
  const [volta, setVolta] = useState(() => Math.floor(Math.random() * 1000));
  const [i, setI] = useState(0);
  const [anterior, setAnterior] = useState(null);
  const [tamanho, setTamanho] = useState({ w: 800, h: 520 });
  const caixa = useRef(null);
  const quadros = quadrosDaMontra(livros, cfg.fonte, volta, cfg.duracao);
  const q = quadros[i];

  useEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setTamanho({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onFimRef = useRef(onFim);
  onFimRef.current = onFim;
  useEffect(() => {
    if (!q) return undefined;
    const t = setTimeout(() => {
      setAnterior({ q, chave: `${volta}-${i}` });
      if (i + 1 < quadros.length) setI(i + 1);
      else if (continuo) {
        setVolta((v) => v + 1);
        setI(0);
      } else onFimRef.current?.();
    }, q.s * 1000);
    return () => clearTimeout(t);
  }, [q, i, volta, quadros.length, continuo]);
  useEffect(() => {
    if (!anterior) return undefined;
    const t = setTimeout(() => setAnterior(null), PASSAGEM_MS + 250);
    return () => clearTimeout(t);
  }, [anterior]);

  const desenhar = (x) => (x.tipo === 'abertura' ? <Abertura q={x} logo={logo} />
    : x.tipo === 'prateleira' ? <Prateleira q={x} precos={cfg.precos} caixa={tamanho} />
      : <QuadroLivro q={x} caixa={tamanho} precos={cfg.precos} logo={logo} />);
  const chave = `${volta}-${i}`;
  const estilo = estiloDaPassagem(transicao, volta * 31 + i);
  const total = quadros.reduce((s, x) => s + x.s, 0);

  return (
    <div ref={caixa} className="relative h-full w-full overflow-hidden bg-[#021a21] text-white">
      <style>{ESTILO + ESTILO_MONTRA}</style>
      {!q ? (
        <div className="grid h-full place-items-center p-8 text-center text-white/70">
          <div className="space-y-3">
            <BookOpen className="mx-auto h-10 w-10" />
            <p>{semInternet ? 'Sem internet e ainda sem livros guardados nesta TV.' : 'A carregar os livros…'}</p>
          </div>
        </div>
      ) : (
        <>
          {anterior && anterior.chave !== chave && <div key={anterior.chave} className={cn('absolute inset-0', estilo === 'deslizar' && 'pub-s-deslizar')}>{desenhar(anterior.q)}</div>}
          <div key={chave} className={cn('absolute inset-0', anterior && `pub-t-${estilo}`)}>{desenhar(q)}</div>
          <div className="absolute left-4 top-3 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/85 backdrop-blur-sm">
            <BookOpen className="h-3.5 w-3.5" />Montra
            {semInternet && <span className="ml-1 inline-flex items-center gap-1 normal-case tracking-normal text-amber-300"><WifiOff className="h-3.5 w-3.5" />sem internet</span>}
          </div>
          {!continuo && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
              <div key={`b-${volta}`} className="h-full origin-left" style={{ background: MARCA.ouro, animation: `montra-barra ${total}s linear both` }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ a publicidade com a montra

/**
 * A publicidade da TV com a montra de livros, sem tirar nada à publicidade: sem anúncios ou sem internet, passa a
 * montra (as capas ficaram guardadas); com a internet estável, de `aCada` em `aCada` minutos entra um minuto (ou o
 * escolhido) de montra entre duas peças — um vídeo nunca é cortado a meio, a não ser que seja o único e se repita.
 * Ao voltar, a publicidade continua na peça seguinte. `agora`: muda para mostrar a montra já.
 */
export function PublicidadeComMontra({ midia, som, logo, nome, transicao, vinhetas, montra, agora = 0 }) {
  const internet = useInternet();
  const livros = useLivrosMontra(montra.fonte);
  const temLivros = livros.destaques.length > 0 || livros.temas.length > 0;
  const pecas = sequenciaTv(midia, { vinhetas }).length;
  const continuo = temLivros && ((montra.semPublicidade && pecas === 0) || (montra.semInternet && internet === 'sem'));
  // 'pub' → 'entra' → 'montra' → 'sai' → 'pub'
  const [fase, setFase] = useState('pub');
  const desde = useRef(Date.now());
  const pendente = useRef(false);
  const posicao = useRef(0);

  const entrar = useCallback(() => {
    pendente.current = false;
    setFase('entra');
    setTimeout(() => setFase((f) => (f === 'entra' ? 'montra' : f)), PASSAGEM_MS + 100);
  }, []);
  const sair = useCallback(() => {
    setFase('sai');
    setTimeout(() => {
      desde.current = Date.now();
      setFase('pub');
    }, PASSAGEM_MS + 100);
  }, []);

  // de X em X minutos, a montra fica à espera da próxima passagem entre peças (ou entra já, com uma peça só)
  useEffect(() => {
    if (!montra.aCada || continuo || !temLivros) return undefined;
    const t = setInterval(() => {
      if (fase !== 'pub' || Date.now() - desde.current < montra.aCada * 60_000) return;
      if (pecas < 2) entrar();
      else pendente.current = true;
    }, 5_000);
    return () => clearInterval(t);
  }, [montra.aCada, continuo, temLivros, fase, pecas, entrar]);

  // «Mostrar a montra já» nas definições
  useEffect(() => {
    if (agora && temLivros && fase === 'pub' && !continuo) entrar();
  }, [agora]); // eslint-disable-line react-hooks/exhaustive-deps

  // a internet voltou (ou chegou publicidade): a montra contínua sai com a transição
  const eraContinuo = useRef(continuo);
  useEffect(() => {
    if (eraContinuo.current && !continuo) {
      eraContinuo.current = continuo;
      setFase('sai');
      const t = setTimeout(() => { desde.current = Date.now(); setFase('pub'); }, PASSAGEM_MS + 100);
      return () => clearTimeout(t);
    }
    eraContinuo.current = continuo;
    return undefined;
  }, [continuo]);

  const aoPassar = useCallback((prox) => {
    posicao.current = prox;
    if (!pendente.current) return false;
    entrar();
    return true;
  }, [entrar]);

  const mostrarLeitor = !continuo && fase !== 'montra';
  const mostrarMontra = continuo || fase !== 'pub';
  const estilo = estiloDaPassagem(transicao, Math.floor(desde.current / 1000));
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <style>{`${ESTILO}@keyframes montra-sai{from{opacity:1}to{opacity:0}}.montra-sai{animation:montra-sai ${PASSAGEM_MS}ms ease-in both}`}</style>
      {mostrarLeitor && (
        <div className="absolute inset-0">
          <LeitorPublicidade midia={midia} som={som && fase === 'pub'} logo={logo} nome={nome} transicao={transicao} vinhetas={vinhetas}
            inicial={posicao.current} onPassagem={aoPassar} />
        </div>
      )}
      {mostrarMontra && (
        <div className={cn('absolute inset-0', !continuo && fase === 'entra' && `pub-t-${estilo}`, !continuo && fase === 'sai' && 'montra-sai')}>
          <MontraLivros livros={livros} cfg={montra} transicao={transicao} logo={logo} continuo={continuo}
            semInternet={internet === 'sem'} onFim={sair} />
        </div>
      )}
    </div>
  );
}
