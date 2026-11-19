import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { subscribeSignal } from '@/lib/realtimeSignals';
import { cn } from '@/lib/utils';
import { livrosParaRodape, mensagensDeHoje, noticias } from '@/lib/painelGestao';
import { MARCA } from '@/components/gestao/marca';

/** As mensagens da direcção para o rodapé (public.painel_rodape); chegam logo pelo sinal «rodape». */
export function useMensagensRodape() {
  const [lista, setLista] = useState([]);
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('painel_rodape').select('*').order('ordem').order('id');
    setLista(data || []);
  }, []);
  useEffect(() => {
    carregar();
    const off = subscribeSignal('painel', 'rodape', () => carregar());
    const t = setInterval(carregar, 600_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [carregar]);
  return { lista, recarregar: carregar };
}

/**
 * Os livros das livrarias para o rodapé: as promoções em vigor e as novidades com stock, do catálogo do site
 * (stock_books, a leitura pública). Volta a ler de 10 em 10 minutos.
 */
export function useLivrosRodape() {
  const [livros, setLivros] = useState({ promocoes: [], novidades: [] });
  const carregar = useCallback(async () => {
    const campos = 'title, author, price, sale_price, sale_starts_at, sale_ends_at, stock, cover_image, cover, created, active';
    const [promo, novos] = await Promise.all([
      supabase.from('stock_books').select(campos).eq('active', true).not('sale_price', 'is', null).limit(40),
      supabase.from('stock_books').select(campos).eq('active', true).gt('stock', 0).order('created', { ascending: false }).limit(12),
    ]);
    const todos = [...(promo.data || []), ...(novos.data || [])];
    setLivros(livrosParaRodape(todos));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 600_000);
    return () => clearInterval(t);
  }, [carregar]);
  return livros;
}

const TONS = { bom: '#34d399', mau: '#fca5a5', aviso: '#fbbf24', neutro: '#7fd3e6' };

function HoraDeLuanda() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return agora.toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' });
}

/**
 * O rodapé a passar, como nos noticiários: «Vendas Online», o logótipo, as notícias do painel (e as mensagens da
 * direcção) a correr, e a hora. `fixo`: preso ao fundo do ecrã; senão acompanha a página (sticky).
 */
export default function RodapeNoticias({ dados, fixo = false, tv = false, className }) {
  const { lista } = useMensagensRodape();
  const livros = useLivrosRodape();
  const hoje = String(dados?.agora || '').slice(0, 10);
  const itens = noticias(dados, mensagensDeHoje(lista, hoje), livros);
  if (!itens.length) return null;
  // velocidade de leitura constante, por muito ou pouco texto que haja
  const letras = itens.reduce((s, n) => s + n.texto.length + n.etiqueta.length + 6, 0);
  const duracao = Math.max(Math.round(letras * (tv ? 0.2 : 0.17)), 25);
  const conteudo = itens.map((n, i) => (
    <span key={i} className="mx-5 inline-flex items-center gap-3 whitespace-nowrap">
      {n.imagem && (
        // a capa do livro (ou a imagem da mensagem), pequena, ao lado da notícia
        <img src={n.imagem} alt="" loading="lazy"
          className={cn('shrink-0 object-cover shadow ring-1 ring-white/25', n.forma === 'capa' ? (tv ? 'h-11 w-8 rounded' : 'h-8 w-6 rounded-sm') : (tv ? 'h-10 w-10 rounded-lg' : 'h-7 w-7 rounded-md'))} />
      )}
      <span className="rounded-md px-2 py-0.5 text-[0.72em] font-black tracking-[0.12em]" style={{ background: TONS[n.tom] || TONS.neutro, color: MARCA.marinhoProfundo }}>
        {n.etiqueta}
      </span>
      <span className="font-medium text-white">{n.texto}</span>
      <span className="ml-3 h-1.5 w-1.5 rotate-45 bg-white/30" />
    </span>
  ));
  return (
    <div
      className={cn('flex items-stretch overflow-hidden text-white shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.55)]',
        fixo ? 'fixed inset-x-0 bottom-0 z-40' : 'sticky bottom-0 z-30 rounded-xl',
        tv ? 'h-14 text-lg' : 'h-11 text-sm', className)}
      style={{ background: MARCA.marinhoProfundo, paddingBottom: fixo ? 'env(safe-area-inset-bottom, 0px)' : undefined }}
      role="marquee" aria-label="Notícias do painel"
    >
      <div className="z-10 flex shrink-0 items-center gap-2 px-4 font-black uppercase tracking-[0.16em]" style={{ background: '#c8102e' }}>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <span className={tv ? 'text-base' : 'text-xs'}>Vendas Online</span>
      </div>
      <div className="z-10 hidden shrink-0 items-center px-3 sm:flex" style={{ background: MARCA.azul }}>
        <img src={MARCA.logoBranco} alt={MARCA.nome} className={cn('w-auto object-contain', tv ? 'h-9' : 'h-7')} />
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <style>{`@keyframes painel-rodape{from{transform:translateX(0)}to{transform:translateX(-50%)}}
          .painel-rodape{animation:painel-rodape ${duracao}s linear infinite}
          .painel-rodape-caixa:hover .painel-rodape{animation-play-state:paused}
          @media (prefers-reduced-motion: reduce){.painel-rodape{animation:none}}`}</style>
        <div className="painel-rodape-caixa absolute inset-0 flex items-center">
          <div className="painel-rodape inline-flex w-max items-center">
            <span className="inline-flex items-center">{conteudo}</span>
            <span className="inline-flex items-center" aria-hidden="true">{conteudo}</span>
          </div>
        </div>
        <span className="pointer-events-none absolute inset-y-0 left-0 w-8" style={{ background: `linear-gradient(90deg, ${MARCA.marinhoProfundo}, transparent)` }} />
        <span className="pointer-events-none absolute inset-y-0 right-0 w-8" style={{ background: `linear-gradient(270deg, ${MARCA.marinhoProfundo}, transparent)` }} />
      </div>
      <div className="z-10 flex shrink-0 items-center px-4 font-mono font-black tabular-nums text-white" style={{ background: MARCA.petroleo }}>
        <HoraDeLuanda />
      </div>
    </div>
  );
}
