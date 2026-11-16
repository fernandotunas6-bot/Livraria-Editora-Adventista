// O trajeto de quem entrega dentro do app iOS, com o ecrã apagado (docs/TRAJETO_GPS.md).
//
// No site, a posição só sai com a página aberta. No app, o GPS e o envio ficam com o iPhone
// (app/ios/ios/App/App/TrajetoPlugin.swift), pela mesma função do Supabase que o site usa, com a
// sessão de quem entrega. Daqui passa-se a sessão, renovada sempre que o site a renova, e
// recebem-se as leituras e os envios para o ecrã da entrega.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/lib/supabaseClient';
import { pluginDoApp } from '@/lib/nativeApp';

const pluginTrajeto = () => pluginDoApp('Trajeto');

/** O app sabe partilhar o trajeto com o ecrã apagado? (Só o app iOS.) */
export async function trajetoNativoDisponivel() {
  return !!(await pluginTrajeto());
}

/** A partilha que o iPhone tem em curso: `{ activa, encomenda?, enviadoEm? }`. */
export async function estadoDoTrajetoNativo() {
  const trajeto = await pluginTrajeto();
  if (!trajeto) return { activa: false };
  try {
    return await trajeto.estado();
  } catch {
    return { activa: false };
  }
}

let renovacao = null;

/** Enquanto partilha, cada sessão nova do site (renovada de hora a hora) segue para o iPhone. */
function seguirASessao(trajeto) {
  renovacao?.unsubscribe?.();
  renovacao = supabase.auth.onAuthStateChange((evento, sessao) => {
    if (!sessao?.access_token || !['TOKEN_REFRESHED', 'SIGNED_IN'].includes(evento)) return;
    trajeto.actualizarSessao({ sessao: sessao.access_token }).catch(() => {});
  }).data?.subscription || null;
}

/**
 * Começa a partilhar a posição desta encomenda. `ouvir` recebe os acontecimentos do iPhone:
 * `leitura` ({ lat, lng, accuracy }), `enviado` ({ quando }), `erro` ({ codigo, mensagem }) e
 * `terminou` ({ mensagem }). Devolve uma função para deixar de ouvir (a partilha continua).
 */
export async function iniciarTrajetoNativo(orderId, ouvir = {}) {
  const trajeto = await pluginTrajeto();
  if (!trajeto) throw new Error('Esta versão da app não partilha o trajeto com o ecrã apagado.');
  const { data } = await supabase.auth.getSession();
  const sessao = data?.session?.access_token;
  if (!sessao) throw new Error('Entre na sua conta para partilhar a localização.');
  await trajeto.iniciar({ encomenda: String(orderId), supabaseUrl: SUPABASE_URL, chave: SUPABASE_PUBLISHABLE_KEY, sessao });
  seguirASessao(trajeto);
  return ouvirTrajetoNativo(ouvir);
}

/** Volta a ouvir uma partilha que já corria (voltar à página da entrega). */
export async function ouvirTrajetoNativo(ouvir = {}) {
  const trajeto = await pluginTrajeto();
  if (!trajeto) return () => {};
  if (!renovacao) seguirASessao(trajeto);
  const handles = await Promise.all(
    ['leitura', 'enviado', 'erro', 'terminou']
      .filter((evento) => typeof ouvir[evento] === 'function')
      .map((evento) => trajeto.addListener(evento, (dados) => {
        if (evento === 'terminou') { renovacao?.unsubscribe?.(); renovacao = null; }
        ouvir[evento](dados || {});
      })),
  );
  return () => handles.forEach((h) => h?.remove?.());
}

/** Pára de ler e de mandar a posição (o servidor fica a saber pelo `stopSharing` do site). */
export async function pararTrajetoNativo() {
  renovacao?.unsubscribe?.();
  renovacao = null;
  const trajeto = await pluginTrajeto();
  if (!trajeto) return;
  try {
    await trajeto.parar();
  } catch {
    // Já parado.
  }
}
