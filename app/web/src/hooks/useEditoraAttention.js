// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { useSignal } from '@/hooks/useSignal';
import { editoraAttention } from '@/lib/editoraAttention';
import { keepUnchanged } from '@/lib/keepUnchanged';
import { todayLuanda } from '@/lib/production';
import { loadEditoraAttention } from '@/lib/productionApi';

const EMPTY = Object.freeze({ items: [], badges: {} });

/**
 * "Precisa de atenção" da Editora e das finanças, e os números da navegação (Produção e
 * Funcionários), para quem gere a produção ou paga. Lê pouco (lib/productionApi.js), volta a ler
 * com os sinais em tempo real «producao», «funcionarios» e «financas», e de reserva de minuto a
 * minuto sem eles (de 5 em 5 com eles). O dia conta pelo relógio partilhado: à meia-noite de
 * Luanda uma etapa passa a atrasada sem precisar de sinal nenhum.
 */
export function useEditoraAttention(perms, { enabled = true } = {}) {
  const production = !!perms?.production;
  const finance = !!perms?.finance;
  const on = enabled && (production || finance);
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    const fresh = await loadEditoraAttention({ finance });
    setData((prev) => keepUnchanged(prev, fresh));
  }, [finance]);

  useEffect(() => {
    if (!on) { setData(null); return; }
    load().catch(() => { /* sem a migração, ou sem rede: o Início fica como estava */ });
  }, [on, load]);
  const live = useSignal('painel', ['producao', 'funcionarios', 'financas'], () => {
    load().catch(() => {});
  }, { enabled: on });
  useAutoRefresh(load, { intervalMs: live ? 5 * 60_000 : 60_000, enabled: on });

  const today = todayLuanda(useMinuteTick());
  return useMemo(
    () => (on && data ? editoraAttention({ perms: { production, finance }, ...data, today }) : EMPTY),
    [on, data, production, finance, today],
  );
}
