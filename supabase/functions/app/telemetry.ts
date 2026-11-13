// Validação dos eventos de saúde do site (POST /telemetria): erros de JavaScript e Core Web
// Vitals medidos em quem visita. A rota é pública, por isso tudo o que chega é cortado e
// conferido aqui antes de ir para private.site_events (migração saude_do_site).
//
// Nada de dados pessoais: a página fica sem ids nem parâmetros, e os endereços dentro das
// mensagens e da pilha perdem a parte do pedido (?…, #…), onde podia ir um token.

type Row = Record<string, any>;

export const MAX_EVENTS = 20;
export const VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
// Teto de cada métrica: um valor acima é um defeito da medição, não uma visita lenta.
const VITAL_MAX: Record<string, number> = { LCP: 120_000, INP: 60_000, CLS: 50, FCP: 120_000, TTFB: 120_000 };

const text = (value: unknown, max: number) =>
  String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Tira o pedido (?…, #…) de todos os endereços de um texto. */
export function withoutQueries(value: string) {
  return value.replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/gi, "$1");
}

/**
 * A página sem ids: `/product/abc123` → `/product/:id`. Fica o primeiro segmento (a página) e
 * os restantes passam a `:id`, que é o que interessa para agrupar e não diz quem visitou.
 */
export function cleanPage(value: unknown) {
  const path = text(value, 300).split(/[?#]/)[0] || "/";
  if (!path.startsWith("/")) return "/";
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return "/";
  const first = /^[a-z0-9-]{1,40}$/i.test(parts[0]) ? parts[0].toLowerCase() : ":id";
  return `/${[first, ...parts.slice(1).map(() => ":id")].join("/")}`.slice(0, 120);
}

function cleanEvent(raw: unknown): Row | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const e = raw as Row;
  const base: Row = {
    page: cleanPage(e.page),
    device: e.device === "desktop" ? "desktop" : "mobile",
    connection: /^[a-z0-9-]{1,12}$/i.test(String(e.connection ?? "")) ? String(e.connection) : null,
    app_version: /^[\w.-]{1,40}$/.test(String(e.app_version ?? "")) ? String(e.app_version) : null,
  };
  if (e.kind === "vital") {
    const name = String(e.name ?? "").toUpperCase();
    const value = Number(e.value);
    if (!(VITALS as readonly string[]).includes(name)) return null;
    if (!Number.isFinite(value) || value < 0 || value > VITAL_MAX[name]) return null;
    const target = text(e.detail?.target, 120);
    return { ...base, kind: "vital", name, value: Math.round(value * 1000) / 1000, detail: target ? { target } : {} };
  }
  if (e.kind === "error") {
    const name = withoutQueries(text(e.name, 300));
    if (!name) return null;
    const detail: Row = {};
    const source = withoutQueries(text(e.detail?.source, 200));
    if (source) detail.source = source;
    for (const key of ["line", "col"]) {
      const n = Number(e.detail?.[key]);
      if (Number.isInteger(n) && n >= 0 && n < 10_000_000) detail[key] = n;
    }
    const stack = withoutQueries(String(e.detail?.stack ?? "").slice(0, 1500)).replace(/[\u0000-\u0008\u000b-\u001f]/g, "");
    if (stack.trim()) detail.stack = stack;
    return { ...base, kind: "error", name, value: null, detail };
  }
  return null;
}

/** Os eventos válidos de um pedido (no máximo 20); os outros ficam de fora sem erro. */
export function cleanTelemetry(body: unknown): Row[] {
  const list = (body as Row)?.events;
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_EVENTS).map(cleanEvent).filter((e): e is Row => !!e);
}
