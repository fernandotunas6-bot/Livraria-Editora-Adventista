// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O posto de ensaio contra um site falso que faz o que a Edge Function faz (kangestSinc.ts do lado do servidor): prova
// a ida e volta com a cifra verdadeira, e que o ensaio dá pelos problemas.
import { describe, expect, it } from 'vitest';
import { ensaio, normalizarEndereco } from './ensaio-posto.mjs';
import {
  aadDoPedido, abrirPedido, assinaturaValida, mensagemAssinada, paraB64, selarResposta, sha256Hex,
} from '../../supabase/functions/app/kangestSinc.ts';

const POSTO = '00000000-0000-4000-8000-000000000001';

async function siteFalso({ semAuth = false, aceitaRepetidos = false } = {}) {
  const par = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const centro = {
    kid: '1',
    privada: paraB64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey)).slice(-32)),
    publica: paraB64(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))),
  };
  let chavePosto = null;
  const nonces = new Set();
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status });
  return async (url, pedido) => {
    const corpo = pedido.body;
    if (url.endsWith('/kangest/emparelhar')) {
      const b = JSON.parse(corpo);
      if (b.codigo !== 'ABCD-EFGH') return json({ message: 'Código inválido ou fora de prazo: peça outro no painel.' }, 400);
      chavePosto = b.chave_publica;
      return json({
        posto: { id: POSTO, nome: 'Ensaio', loja: 'Livraria — Huambo' }, centro: { kid: centro.kid, chave_publica: centro.publica },
        auth: semAuth ? null : { url: 'https://abc.supabase.co', apikey: 'sb_publishable_x' }, tempo_real: { topico: 'a'.repeat(32) },
      });
    }
    const h = pedido.headers;
    const posto = h['x-kangest-posto'], hora = h['x-kangest-hora'], nonce = h['x-kangest-nonce'];
    if (!await assinaturaValida(chavePosto, mensagemAssinada(posto, hora, nonce, await sha256Hex(corpo)), h['x-kangest-assinatura'])) {
      return json({ message: 'Assinatura inválida.' }, 401);
    }
    if (nonces.has(nonce) && !aceitaRepetidos) return json({ message: 'Pedido repetido.' }, 409);
    nonces.add(nonce);
    const { dados, chaveResposta } = await abrirPedido(JSON.parse(corpo), [centro], aadDoPedido(posto, hora, nonce));
    expect(dados).toEqual({ lote: [], cursores: { encomendas: {}, produtos: {} } });
    return json(await selarResposta(chaveResposta, nonce, {
      resultado: null, site: 'https://livrariaadventista.ao',
      novidades: { encomendas: [{ id: 'o1' }], produtos: [{ id: 'b1' }, { id: 'b2' }], mais: { encomendas: false, produtos: true } },
    }));
  };
}

describe('posto de ensaio', () => {
  it('o endereço do painel, com ou sem a barra e a rota', () => {
    expect(normalizarEndereco(' https://abc.supabase.co/functions/v1/app/ ')).toBe('https://abc.supabase.co/functions/v1/app');
    expect(normalizarEndereco('https://abc.supabase.co/functions/v1/app/kangest/sinc')).toBe('https://abc.supabase.co/functions/v1/app');
  });

  it('com o site certo, todos os passos passam (a cifra verdadeira de ida e volta)', async () => {
    const r = await ensaio({ endereco: 'https://abc.supabase.co/functions/v1/app', codigo: 'ABCD-EFGH', fetchFn: await siteFalso() });
    expect(r.passos.filter((p) => !p.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.posto).toBe(POSTO);
    expect(r.passos.find((p) => p.nome === 'Novidades da loja').detalhe).toBe('1 encomendas e 2 produtos (e mais); site https://livrariaadventista.ao');
  });

  it('dá pelo que falta e pelo que o site não recusa', async () => {
    const r = await ensaio({ endereco: 'https://abc.supabase.co/functions/v1/app', codigo: 'ABCD-EFGH', fetchFn: await siteFalso({ semAuth: true, aceitaRepetidos: true }) });
    expect(r.ok).toBe(false);
    expect(r.passos.filter((p) => !p.ok).map((p) => p.nome)).toEqual(['Chave pública para as pessoas entrarem no KanGest', 'O mesmo pedido outra vez é recusado']);
  });

  it('código errado: pára no emparelhamento, com a mensagem do site', async () => {
    const r = await ensaio({ endereco: 'https://abc.supabase.co/functions/v1/app', codigo: 'ZZZZ-ZZZZ', fetchFn: await siteFalso() });
    expect(r.ok).toBe(false);
    expect(r.passos.at(-1)).toMatchObject({ nome: 'Emparelhar com o código', ok: false, detalhe: 'Código inválido ou fora de prazo: peça outro no painel.' });
  });
});
