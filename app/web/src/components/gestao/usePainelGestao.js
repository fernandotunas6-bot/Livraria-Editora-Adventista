// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { onSignalStatus, signalStatus, subscribeSignal } from '@/lib/realtimeSignals';

/**
 * Os números do Painel de Gestão (public.painel_gestao), ao vivo: a base manda o sinal «vendas» pelo canal
 * «painel» a cada venda e o painel volta a pedi-los (agrupando os sinais seguidos). Sem tempo real, pede-os de
 * 30 em 30 segundos. `estado`: 'ao-vivo' | 'a-actualizar' (sem tempo real) | 'sem-ligacao'.
 */
export function usePainelGestao({ alvo = '', canal = '' } = {}) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [ligacao, setLigacao] = useState(() => signalStatus('painel'));
  const [falhou, setFalhou] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const n = ++pedido.current;
    const { data, error } = await supabase.rpc('painel_gestao', { p_alvo: alvo || null, p_canal: canal || null });
    if (n !== pedido.current) return; // chegou um pedido mais novo
    if (error) {
      setFalhou(true);
      setErro(error.message || 'Não foi possível ler o painel.');
      return;
    }
    setFalhou(false);
    setErro('');
    setDados(data);
  }, [alvo, canal]);

  // a função de carregar mais recente, para o canal não fechar e reabrir a cada troca de loja (o modo TV roda)
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    let espera = null;
    // várias vendas seguidas (um fecho de caixa, uma sincronização) dão um só pedido
    const off = subscribeSignal('painel', 'vendas', () => {
      clearTimeout(espera);
      espera = setTimeout(() => carregarRef.current(), 700);
    });
    const offEstado = onSignalStatus('painel', setLigacao);
    setLigacao(signalStatus('painel'));
    return () => {
      clearTimeout(espera);
      off();
      offEstado();
    };
  }, []);

  // com tempo real, uma volta de 2 em 2 minutos por segurança; sem ele, de 30 em 30 segundos
  useEffect(() => {
    const t = setInterval(carregar, ligacao === 'connected' ? 120_000 : 30_000);
    return () => clearInterval(t);
  }, [carregar, ligacao]);

  // ao voltar ao separador (ou a TV acordar), números novos já
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [carregar]);

  const estado = falhou ? 'sem-ligacao' : ligacao === 'connected' ? 'ao-vivo' : 'a-actualizar';
  return { dados, erro, estado, recarregar: carregar };
}

/** Um número que sobe (ou desce) até ao valor novo, como um contador; sem animação com «reduzir movimento». */
export function useNumeroAnimado(valor, ms = 900) {
  const alvo = Number(valor) || 0;
  const [mostrado, setMostrado] = useState(alvo);
  const desde = useRef(alvo);
  useEffect(() => {
    const reduzir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const inicio = desde.current;
    if (reduzir || inicio === alvo) {
      desde.current = alvo;
      setMostrado(alvo);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const passo = (t) => {
      // o primeiro quadro pode vir com a hora um pouco antes de t0: nunca abaixo de 0 (nem acima de 1)
      const p = Math.min(Math.max((t - t0) / ms, 0), 1);
      const suave = 1 - (1 - p) ** 3;
      const v = inicio + (alvo - inicio) * suave;
      setMostrado(v);
      desde.current = v;
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return mostrado;
}
