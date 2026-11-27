// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useEffect, useState } from 'react';

/**
 * O que um movimento da página faz ao botão: `null` se foi pequeno demais para contar (menos de `limiar` px); senão, a
 * posição nova e se fica recolhido (só a descer, e já longe do topo).
 */
export function aoRolar({ y, ultimo, limiar = 8, topo = 80 }) {
  const delta = y - ultimo;
  if (Math.abs(delta) < limiar) return null;
  return { ultimo: y, recolhido: delta > 0 && y > topo };
}

/**
 * `true` enquanto a página desce, e volta a `false` quando pára (ao fim de `paragem` ms) ou quando sobe. Para um botão
 * flutuante sair da frente do conteúdo enquanto se lê, e voltar logo que se pára (revisão do estilo de 27/11,
 * escolha 7: o botão do chat). Uma descida de menos de `limiar` px não conta, para não piscar.
 */
export function useRecolherAoDescer({ paragem = 700, limiar = 8, activo = true } = {}) {
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    if (!activo || typeof window === 'undefined') {
      setRecolhido(false);
      return undefined;
    }
    let ultimo = window.scrollY;
    let temporizador;
    const ouvir = () => {
      const r = aoRolar({ y: window.scrollY, ultimo, limiar });
      if (!r) return;
      ultimo = r.ultimo;
      setRecolhido(r.recolhido);
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(() => setRecolhido(false), paragem);
    };
    window.addEventListener('scroll', ouvir, { passive: true });
    return () => {
      window.removeEventListener('scroll', ouvir);
      window.clearTimeout(temporizador);
    };
  }, [paragem, limiar, activo]);

  return recolhido;
}

export default useRecolherAoDescer;
