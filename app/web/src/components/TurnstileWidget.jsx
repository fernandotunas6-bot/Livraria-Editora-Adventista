import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile nos formulários públicos que gravam (checkout, contacto, candidatura a
 * colportor, newsletter). O servidor só o exige quando a loja tem as duas chaves configuradas
 * (supabase/functions/app/turnstile.ts); o /settings publica então `turnstile_site_key`, e só aí este
 * componente carrega alguma coisa. Sem a chave, não desenha nada nem descarrega o script.
 *
 * Modo «interaction-only»: para quase toda a gente não aparece nada; o Cloudflare só pede um clique
 * quando desconfia. Os tokens servem uma vez e expiram em 5 minutos: depois de cada envio, `reset()`.
 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading = null;

export function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Sem janela.'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile indisponível.')));
      script.onerror = () => {
        loading = null;
        reject(new Error('Turnstile indisponível.'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** O token do formulário e o pedido de um novo (depois de cada envio). */
export function useTurnstileToken() {
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => {
    setToken('');
    setResetKey((k) => k + 1);
  }, []);
  return { token, setToken, resetKey, reset };
}

/** A frase quando ainda não há token (o Cloudflare está a confirmar, ou pede um clique). */
export const TURNSTILE_WAIT = 'Um momento: estamos a confirmar que não é um robô. Se aparecer uma caixa, carregue nela.';

export default function TurnstileWidget({ siteKey, onToken, resetKey = 0, action = '', className = '' }) {
  const box = useRef(null);
  const widget = useRef(null);
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return undefined;
    let cancelled = false;
    loadTurnstile().then((turnstile) => {
      if (cancelled || !box.current) return;
      widget.current = turnstile.render(box.current, {
        sitekey: siteKey,
        ...(action ? { action } : {}),
        appearance: 'interaction-only',
        callback: (token) => tokenCallback.current?.(token || ''),
        'expired-callback': () => tokenCallback.current?.(''),
        'error-callback': () => tokenCallback.current?.(''),
      });
    }).catch(() => {
      // Sem o script (rede, bloqueador): o servidor recusa sem token e o formulário diz porquê.
    });
    return () => {
      cancelled = true;
      try {
        if (widget.current != null) window.turnstile?.remove(widget.current);
      } catch {
        // o widget já não existe
      }
      widget.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (!resetKey || widget.current == null) return;
    try {
      window.turnstile?.reset(widget.current);
    } catch {
      // o widget já não existe
    }
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className={className} data-testid="turnstile" />;
}
