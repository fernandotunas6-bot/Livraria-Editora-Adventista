// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Página de teste do som dos vídeos (e2e/painel-vendas.spec.js): a mistura da banda sonora feita
// à parte (OfflineAudioContext), para o teste medir onde há som e com que força, sem tempo real.
import { criarMistura, prepararSom } from '@/painel-vendas/som-video.js';
import { pistaDeEfeitos } from '@/painel-vendas/deixas-video.js';

/**
 * Mistura `total` segundos com as deixas `pista` e devolve o nível (RMS) a cada 50 ms, o pico e
 * os mesmos números só da música e só dos efeitos.
 */
async function misturar(pista, total, { musica = 0.55, efeitos = 0.85 } = {}) {
  const sr = 24000;
  const som = await prepararSom(sr);
  const medir = async (vol) => {
    const ctx = new OfflineAudioContext(2, Math.ceil((total + 0.5) * sr), sr);
    const m = criarMistura(ctx, som, vol);
    m.master.connect(ctx.destination);
    m.tocar({ pista, total, desde: 0, quando: 0 });
    const b = await ctx.startRendering();
    const d = b.getChannelData(0);
    const w = Math.round(sr * 0.05);
    const rms = [];
    let pico = 0;
    for (let i = 0; i + w <= d.length; i += w) {
      let s = 0;
      for (let k = i; k < i + w; k++) { s += d[k] * d[k]; pico = Math.max(pico, Math.abs(d[k])); }
      rms.push(Math.sqrt(s / w));
    }
    return { rms, pico };
  };
  return {
    tudo: await medir({ musica, efeitos }),
    musica: await medir({ musica, efeitos: 0 }),
    efeitos: await medir({ musica: 0, efeitos }),
  };
}

window.__som = { prepararSom, pistaDeEfeitos, misturar };
window.__somPronto = true;
