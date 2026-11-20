// O que o rastreio mostra a quem só tem o número da encomenda e o email.
//
// Achado da análise crítica de 2026-11-20: /track e /track/live devolviam a morada completa, os
// telefones do cliente e do familiar e o ponto GPS de casa a quem tivesse o número e o email. O
// número vai nos recibos, nos emails e no WhatsApp — passa de mão em mão —, e o email é o único
// segredo. Agora, sem uma sessão que seja dona da encomenda, os dados pessoais saem mascarados: o
// suficiente para o cliente reconhecer a encomenda dele, não para um estranho saber onde ele mora.
// Com a conta da encomenda iniciada, vê tudo como antes.
//
// Sem nada de Deno, para os testes correrem no `npm test`.

type Row = Record<string, unknown>;

/** "••• ••• 789": os últimos três algarismos, para reconhecer o número sem o revelar. */
export function maskPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length < 6) return "•••";
  return `••• ••• ${digits.slice(-3)}`;
}

/** O início do texto e reticências: "Rua…" em vez da morada inteira. */
export function maskText(value: unknown, keep = 3): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= keep) return "•••";
  return `${text.slice(0, keep)}…`;
}

/** Só o primeiro nome. */
export const firstNameOnly = (value: unknown) => String(value ?? "").trim().split(/\s+/)[0] || "";

/** Coordenada arredondada a 2 casas (~1 km): mostra a zona, não a casa. */
export function coarse(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Os campos pessoais da encomenda como o rastreio os pode mostrar. `owner` = a sessão é dona da
 * encomenda: tudo como está. Sem isso: telefones e rua mascarados, o familiar só pelo primeiro nome,
 * a morada só até ao bairro, e o ponto GPS arredondado à zona.
 */
export function trackPersonalFields(order: Row, owner: boolean) {
  const province = String(order.delivery_province || "");
  const municipality = String(order.delivery_municipality || "");
  const locality = String(order.delivery_locality || "");
  if (owner) {
    return {
      masked: false,
      customer_name: String(order.customer_name || ""),
      phone: String(order.phone || ""),
      delivery_relative_name: String(order.delivery_relative_name || ""),
      delivery_relative_phone: String(order.delivery_relative_phone || ""),
      delivery_street: String(order.delivery_street || ""),
      delivery_reference: String(order.delivery_reference || ""),
    };
  }
  return {
    masked: true,
    customer_name: firstNameOnly(order.customer_name),
    phone: maskPhone(order.phone),
    delivery_relative_name: firstNameOnly(order.delivery_relative_name),
    delivery_relative_phone: maskPhone(order.delivery_relative_phone),
    delivery_street: maskText(order.delivery_street),
    delivery_reference: order.delivery_reference ? "•••" : "",
    // A morada numa linha, só até ao bairro.
    delivery_address_full: [maskText(order.delivery_street), locality, municipality, province].filter(Boolean).join(", "),
  };
}

/** O ponto de entrega para o mapa: exacto para o dono, arredondado à zona para os outros. */
export function trackDestination<T extends { lat: number; lng: number; accuracy?: number | null } | null>(dest: T, owner: boolean): T {
  if (!dest || owner) return dest;
  return { ...dest, lat: coarse(dest.lat) ?? dest.lat, lng: coarse(dest.lng) ?? dest.lng, accuracy: Math.max(Number(dest.accuracy) || 0, 1000) } as T;
}
