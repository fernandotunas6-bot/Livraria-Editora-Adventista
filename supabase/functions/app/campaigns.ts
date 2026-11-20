// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Decisão de quais canais de uma campanha podem mesmo entregar, sem nada de Deno nem de
// Supabase — por isso testável no `npm test` (ver campaigns.test.ts).
//
// Existe por causa de um problema concreto do agendador automático. Sem a API do WhatsApp, o
// envio não envia: produz um link `wa.me` para alguém clicar, e a notificação fica em
// `status: "manual"`. Num botão carregado por uma pessoa isso faz sentido — ela está ali para
// clicar. Num `pg_cron` às três da manhã, não: fabricaria dezenas de links que ninguém vê,
// marcaria a campanha como enviada e avançaria o `next_send_at`. A campanha passava a constar
// como entregue sem ninguém ter recebido nada.
//
// Daí a regra: **o agendador não agenda o que não entrega.** Salta o canal, não avança a data,
// e diz porquê — para o painel poder mostrar "pendente porque falta X" em vez de silêncio.

export type Canal = "email" | "whatsapp";

/** O que está mesmo configurado para entregar, neste momento. */
export type Entrega = { email: boolean; whatsapp: boolean };

type Definicoes = {
  order_email_enabled?: unknown;
  email_provider?: unknown;
  sendgrid_api_key?: unknown;
  smtp_host?: unknown;
} | null | undefined;

/**
 * O email entrega?
 *
 * Duas condições independentes, e falhar qualquer uma delas dá o mesmo resultado prático:
 * estar ligado nas configurações (`order_email_enabled`) **e** ter um fornecedor com credenciais.
 * Ligado sem fornecedor é o estado mais enganador dos dois, porque o painel mostra o
 * interruptor verde.
 */
export function emailEntrega(settings: Definicoes): boolean {
  if (!settings?.order_email_enabled) return false;
  return settings.email_provider === "sendgrid"
    ? !!settings.sendgrid_api_key
    : !!settings.smtp_host;
}

export type PlanoDeCanais = {
  /** Canais a usar agora. Vazio significa: não enviar e não avançar a data. */
  canais: Canal[];
  /** Canais que a campanha pedia e não entregam. */
  bloqueados: Canal[];
  /** Porque é que estão bloqueados, em texto para o painel. Vazio quando nada está. */
  motivo: string;
};

const MOTIVOS: Record<Canal, string> = {
  email: "falta configurar o envio de email (fornecedor e credenciais, e o interruptor ligado)",
  whatsapp: "falta a API do WhatsApp Cloud — sem ela só há links de envio manual",
};

/**
 * Os canais que uma campanha pediu, cruzados com os que entregam.
 *
 * `channel` vazio conta como `whatsapp`, para seguir o que a Edge Function já fazia: uma
 * campanha gravada sem canal era tratada como WhatsApp, e mudar isso aqui alteraria em
 * silêncio o destino de campanhas já criadas.
 */
export function planearCanais(channel: string | null | undefined, entrega: Entrega): PlanoDeCanais {
  const pedido = (channel || "whatsapp").trim();
  const pedidos: Canal[] = pedido === "both"
    ? ["email", "whatsapp"]
    : pedido === "email" || pedido === "whatsapp"
      ? [pedido]
      // Um canal que não reconhecemos não é tratado como WhatsApp: seria enviar por um meio
      // que ninguém escolheu. Fica bloqueado, e o motivo di-lo pelo nome.
      : [];

  if (!pedidos.length) {
    return { canais: [], bloqueados: [], motivo: `canal desconhecido: "${pedido}"` };
  }

  const canais = pedidos.filter((c) => entrega[c]);
  const bloqueados = pedidos.filter((c) => !entrega[c]);
  const motivo = bloqueados.map((c) => `${c}: ${MOTIVOS[c]}`).join("; ");
  return { canais, bloqueados, motivo };
}

/**
 * O canal a passar ao envio, a partir do plano.
 *
 * O envio aceita `"email"`, `"whatsapp"` ou `"both"`; esta função devolve a forma mais
 * estreita que cobre exactamente os canais que entregam, para um `both` com só um lado
 * configurado não tentar o outro.
 */
export function canalDeEnvio(plano: PlanoDeCanais): "email" | "whatsapp" | "both" | null {
  if (plano.canais.length === 2) return "both";
  return plano.canais[0] ?? null;
}
