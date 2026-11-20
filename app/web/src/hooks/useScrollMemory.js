// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const PREFIX = 'livraria:lugar:';
const MAX_AGE_MS = 30 * 60 * 1000;
const SAVE_EVERY_MS = 150;

/** Lê o lugar guardado para esta lista (ou null). Nunca lança. */
export function readPlace(key, now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const place = JSON.parse(raw);
    if (!place || typeof place !== 'object' || now - (place.at || 0) > MAX_AGE_MS) return null;
    return place;
  } catch {
    return null;
  }
}

export function savePlace(key, place, now = Date.now()) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ ...place, at: now }));
  } catch {
    // armazenamento cheio ou bloqueado: perde-se só a conveniência
  }
}

/**
 * Guarda o lugar numa lista (quantos cartões estavam desenhados, a página, a posição do ecrã)
 * e devolve-o quando se volta atrás. A chave é o caminho e os filtros (o `?search=…`), por
 * isso outra pesquisa começa do zero e nunca mistura resultados antigos com novos.
 *
 * Só repõe em navegações "para trás" (POP): quem entra pela barra ou por uma ligação quer o
 * início. Cuidados por causa do ScrollToTop, que sobe ao topo em cada mudança de rota:
 * - o lugar é lido uma vez, ao montar, e nada se grava até ele ser reposto — senão o scroll
 *   para o topo gravava y=0 por cima dele;
 * - não se grava ao desmontar: nessa altura a página seguinte já subiu ao topo. Fica a última
 *   gravação feita durante o deslize.
 * A reposição espera por `ready` (a lista já com a altura certa) e corre dois frames depois.
 */
export function useScrollMemory({ ready, snapshot }) {
  const location = useLocation();
  const navType = useNavigationType();
  const key = `${location.pathname}${location.search}`;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const initial = useRef(undefined);
  if (initial.current === undefined) initial.current = navType === 'POP' ? readPlace(key) : null;
  const saved = initial.current;
  const canSave = useRef(!saved?.y);

  useEffect(() => {
    if (!ready || canSave.current || !saved?.y) return undefined;
    let inner = 0;
    // Dois frames: o primeiro desenha os cartões repostos, o segundo já tem a altura final.
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        window.scrollTo({ top: saved.y, left: 0, behavior: 'instant' });
        canSave.current = true;
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [ready, saved]);

  const save = useCallback(() => {
    if (!canSave.current) return;
    savePlace(key, { ...snapshotRef.current, y: Math.round(window.scrollY) });
  }, [key]);

  // Grava no máximo de 150 em 150 ms (e uma última vez quando o deslize pára): a cada frame
  // eram dezenas de escritas no sessionStorage por segundo de deslize, para guardar um número.
  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = 0;
        save();
      }, SAVE_EVERY_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [save]);

  return saved;
}
