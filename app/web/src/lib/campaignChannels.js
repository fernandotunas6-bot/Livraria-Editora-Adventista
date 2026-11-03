// Quais canais de uma campanha podem mesmo entregar.
//
// O painel precisa de responder a isto **antes** de enviar: uma campanha pendente cujo canal
// não entrega fica pendente para sempre, e sem esta explicação o separador mostra "1 pendente"
// sem dizer porquê.
//
// A Edge Function segue a mesma regra (supabase/functions/app/campaigns.ts), que é quem decide
// o envio de verdade. Os dois módulos existem porque este vai no bundle do site e aquele corre
// no Deno; `campaignChannels.test.js` importa ambos e confirma que não divergem.

export const MOTIVOS = {
  email: 'falta configurar o envio de email (fornecedor e credenciais, e o interruptor ligado)',
  whatsapp: 'falta a API do WhatsApp Cloud — sem ela só há links de envio manual',
};

/** O email entrega? Ligado nas configurações **e** com fornecedor com credenciais. */
export function emailEntrega(settings) {
  if (!settings?.order_email_enabled) return false;
  return settings.email_provider === 'sendgrid'
    ? !!settings.sendgrid_api_key
    : !!settings.smtp_host;
}

/** Os canais que a campanha pediu, cruzados com os que entregam. */
export function planearCanais(channel, entrega) {
  const pedido = (channel || 'whatsapp').trim();
  const pedidos = pedido === 'both'
    ? ['email', 'whatsapp']
    : pedido === 'email' || pedido === 'whatsapp'
      ? [pedido]
      : [];

  if (!pedidos.length) {
    return { canais: [], bloqueados: [], motivo: `canal desconhecido: "${pedido}"` };
  }

  const canais = pedidos.filter((c) => entrega[c]);
  const bloqueados = pedidos.filter((c) => !entrega[c]);
  return { canais, bloqueados, motivo: bloqueados.map((c) => `${c}: ${MOTIVOS[c]}`).join('; ') };
}

/** O canal a passar ao envio: a forma mais estreita que cobre o que entrega. */
export function canalDeEnvio(plano) {
  if (plano.canais.length === 2) return 'both';
  return plano.canais[0] ?? null;
}

/**
 * O estado do agendador numa frase, a partir de `contact_campaigns_scheduler_status`.
 *
 * O caso do meio é o que justifica esta função existir: com o trabalho agendado e os segredos
 * em falta, o `pg_cron` corre de quinze em quinze minutos, a função de base de dados devolve
 * logo, e **nada** no sistema parece errado — as campanhas é que nunca saem. Foi exactamente
 * assim que o agendador dos emails reportou sucesso durante meia hora sem enviar nada.
 *
 * Devolve `null` quando não há informação: a Edge Function publicada pode ser anterior a isto,
 * e nesse caso é melhor não mostrar nada do que afirmar que está desligado.
 */
export function estadoDoAgendador(scheduler) {
  if (!scheduler) return null;
  if (scheduler.available === false) {
    return {
      ok: false,
      text: `O agendador não está disponível neste projecto (${scheduler.reason || 'pg_cron indisponível'}). As campanhas só saem com "Enviar pendentes".`,
    };
  }
  if (!scheduler.scheduled) {
    return { ok: false, text: 'O agendador está instalado mas não activo. As campanhas só saem com "Enviar pendentes".' };
  }
  if (!scheduler.secrets) {
    return {
      ok: false,
      text: 'O agendador corre mas não chama nada: falta o segredo contact_campaigns_url no Vault do Supabase. As campanhas ficam pendentes sem aviso.',
    };
  }
  return {
    ok: true,
    text: `Agendador activo (${scheduler.schedule || '*/15 * * * *'}): as campanhas pendentes saem sozinhas.`,
  };
}
