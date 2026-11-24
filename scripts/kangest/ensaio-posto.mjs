#!/usr/bin/env node
// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
//
// Um posto de ensaio: confere o lado do site da ligação ao KanGest Livraria antes de instalar o programa numa loja
// (docs/KANGEST-ENSAIO.md). Faz o que o KanGest faz, com a mesma cifra (kangestSinc.ts):
//   1. emparelha com o código do painel (gera a sua chave Ed25519; só a pública sobe);
//   2. sincroniza: um pedido assinado e selado, sem documentos, só a pedir as novidades; abre a resposta selada;
//   3. confirma que o site recusa o mesmo pedido outra vez e uma assinatura errada.
// Não envia facturas (as cópias não se apagam). A chave do posto de ensaio só existe enquanto o comando corre: no fim,
// revogue o posto no painel.
//
// Uso (Node 22.18 ou mais recente):
//   node scripts/kangest/ensaio-posto.mjs <endereço da ligação> <código do painel>
//   ex.: node scripts/kangest/ensaio-posto.mjs https://<projecto>.supabase.co/functions/v1/app ABCD-EFGH
import { pathToFileURL } from 'node:url';
import {
  aadDoPedido, abrirResposta, mensagemAssinada, paraB64, selarPedido, sha256Hex,
} from '../../supabase/functions/app/kangestSinc.ts';

const enc = new TextEncoder();

/** O endereço que o painel mostra, sem a barra do fim nem uma rota colada. */
export function normalizarEndereco(e) {
  return String(e || '').trim().replace(/\/+$/, '').replace(/\/kangest\/(sinc|emparelhar)$/, '');
}

/** Corre o ensaio; devolve `{ ok, passos: [{ nome, ok, detalhe }], posto }`. */
export async function ensaio({ endereco, codigo, fetchFn = fetch }) {
  const passos = [];
  const passo = (nome, ok, detalhe = '') => {
    passos.push({ nome, ok: !!ok, detalhe });
    return !!ok;
  };
  const fim = () => ({ ok: passos.every((p) => p.ok), passos, posto });
  const base = normalizarEndereco(endereco);
  let posto = null;
  if (!passo('Endereço da ligação', /^https?:\/\//.test(base), base || 'em falta')) return fim();

  // 1. emparelhar
  const par = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publica = paraB64(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)));
  let r;
  try {
    r = await fetchFn(`${base}/kangest/emparelhar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, chave_publica: publica, versao: 'ensaio (scripts/kangest/ensaio-posto.mjs)' }),
    });
  } catch (e) {
    passo('Emparelhar com o código', false, `sem ligação ao site: ${e.message}`);
    return fim();
  }
  const v = await r.json().catch(() => ({}));
  if (!passo('Emparelhar com o código', r.ok, r.ok ? `posto «${v.posto?.nome}»${v.posto?.loja ? ` da ${v.posto.loja}` : ' (sem loja: não recebe encomendas)'}` : v.message || `o site respondeu ${r.status}`)) {
    return fim();
  }
  posto = v.posto.id;
  const centro = v.centro;
  passo('Chave pública para as pessoas entrarem no KanGest', !!v.auth?.apikey, v.auth?.apikey ? v.auth.url : 'em falta: defina KANGEST_CHAVE_PUBLICA_SITE');
  passo('Tópico do tempo real', /^[0-9a-f]{32}$/.test(v.tempo_real?.topico || ''), v.tempo_real?.topico ? 'recebido' : 'em falta: a migração 20261125120000 está aplicada?');

  // 2. sincronizar
  const pedido = async ({ estragar = false } = {}) => {
    const hora = String(Math.floor(Date.now() / 1000));
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
    const { envelope, chaveResposta } = await selarPedido(centro.chave_publica, centro.kid, aadDoPedido(posto, hora, nonce), {
      lote: [], cursores: { encomendas: {}, produtos: {} },
    });
    const corpo = JSON.stringify(envelope);
    const assinatura = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, par.privateKey, enc.encode(mensagemAssinada(posto, hora, nonce, await sha256Hex(corpo)))));
    if (estragar) assinatura[0] ^= 1;
    const pedidoHttp = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kangest-posto': posto, 'x-kangest-hora': hora, 'x-kangest-nonce': nonce, 'x-kangest-assinatura': paraB64(assinatura) },
      body: corpo,
    };
    return { res: await fetchFn(`${base}/kangest/sinc`, pedidoHttp), pedidoHttp, nonce, chaveResposta };
  };
  const p1 = await pedido();
  const selado = await p1.res.json().catch(() => ({}));
  if (!passo('Sincronizar (assinado e cifrado)', p1.res.ok, p1.res.ok ? '' : selado.message || `o site respondeu ${p1.res.status}`)) return fim();
  let aberta = null;
  try {
    aberta = await abrirResposta(p1.chaveResposta, p1.nonce, selado);
  } catch {
    // fica null
  }
  if (!passo('Abrir a resposta selada', !!aberta, aberta ? '' : 'a resposta não abre com a chave deste pedido')) return fim();
  const n = aberta.novidades || {};
  passo(
    'Novidades da loja',
    Array.isArray(n.encomendas) && Array.isArray(n.produtos),
    `${n.encomendas?.length ?? 0} encomendas${n.mais?.encomendas ? ' (e mais)' : ''} e ${n.produtos?.length ?? 0} produtos${n.mais?.produtos ? ' (e mais)' : ''}; site ${aberta.site || '—'}`,
  );

  // 3. o que o site tem de recusar
  const repetido = await fetchFn(`${base}/kangest/sinc`, p1.pedidoHttp);
  passo('O mesmo pedido outra vez é recusado', repetido.status === 409, `o site respondeu ${repetido.status}`);
  const estragado = await pedido({ estragar: true });
  passo('Uma assinatura errada é recusada', estragado.res.status === 401, `o site respondeu ${estragado.res.status}`);
  return fim();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [endereco, codigo] = process.argv.slice(2);
  if (!endereco || !codigo) {
    console.error('Uso: node scripts/kangest/ensaio-posto.mjs <endereço da ligação> <código do painel>');
    process.exit(2);
  }
  const r = await ensaio({ endereco, codigo });
  for (const p of r.passos) console.log(`${p.ok ? '✔' : '✘'} ${p.nome}${p.detalhe ? ` — ${p.detalhe}` : ''}`);
  console.log(r.ok ? '\nO lado do site está pronto para o KanGest Livraria.' : '\nHá pontos a corrigir (acima).');
  if (r.posto) console.log('Revogue agora o posto de ensaio no painel (Sistema → Ligação ao KanGest → Postos): a chave dele só existiu neste comando.');
  process.exit(r.ok ? 0 : 1);
}
