// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Fornecedores de email por API HTTP. Funções puras (pedido e leitura da resposta), testadas em
// emailProviders.test.ts; o envio (fetch) fica em index.ts.
//
// Porquê API e não SMTP: as Edge Functions do Supabase não abrem ligações de saída nas portas
// 25 e 587, e a 465 também não é garantida. Um SMTP configurado com a porta 587 (a que quase
// todos os fornecedores indicam) nunca entregaria nada. Por API (HTTPS) não há esse problema.
//
//  - Brevo: plano gratuito com 300 emails por dia; o domínio verifica-se com registos DNS.
//  - Cloudflare Email Sending: o domínio da loja já está no Cloudflare; precisa do plano
//    Workers Paid (3000 emails/mês incluídos) e de um token com permissão de envio.

type Row = Record<string, any>;

export type EmailMessage = {
  to: string;
  fromEmail: string;
  fromName: string;
  /** Para onde vão as respostas do cliente, quando não é o próprio remetente (ver `senderFor`). */
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export type ProviderResult = { ok: boolean; status?: number; detail: string; permanent?: boolean };

export const EMAIL_PROVIDERS = ["brevo", "cloudflare", "sendgrid", "smtp"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

/** Portas que as Edge Functions do Supabase não deixam usar para SMTP. */
export function smtpPortProblem(port: number): string {
  if (port === 25 || port === 587) {
    return `A porta ${port} está bloqueada nas Edge Functions do Supabase: o email nunca sairia. Use um fornecedor por API (Brevo ou Cloudflare) em Configurações → Comunicações.`;
  }
  return "";
}

const clip = (s: string, max: number) => String(s || "").slice(0, max);

/** A mesma forma de endereço que `isEmail` (emails.ts) aceita nas rotas públicas. */
const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const asEmail = (value: unknown) => {
  const v = String(value ?? "").trim();
  return v.length <= 254 && EMAIL_SHAPE.test(v) ? v : "";
};

/**
 * Remetente e endereço de resposta das mensagens da loja.
 *
 * - **Remetente**: o "Email remetente" do painel, senão o email de contacto. Sem nenhum dos
 *   dois não há remetente: antes caía em `noreply@livraria.ao`, um domínio que não é o da
 *   loja — nenhum fornecedor o aceitaria, e se aceitasse a mensagem falhava o SPF/DMARC.
 * - **Responder para**: o email de contacto, quando o remetente é outro (um `loja@` ou
 *   `noreply@` que ninguém lê). É o caminho das respostas dos clientes; sem ele, quem
 *   respondesse a uma confirmação escrevia para uma caixa que não existe.
 */
export function senderFor(settings: Row | null): { fromEmail: string; fromName: string; replyTo: string } {
  const fromEmail = asEmail(settings?.smtp_from_email) || asEmail(settings?.contact_email);
  const contact = asEmail(settings?.contact_email);
  const replyTo = contact && contact.toLowerCase() !== fromEmail.toLowerCase() ? contact : "";
  const fromName = clip(String(settings?.smtp_from_name || settings?.site_name || "Livraria Adventista").trim(), 70);
  return { fromEmail, fromName, replyTo };
}

export function brevoRequest(apiKey: string, m: EmailMessage) {
  return {
    url: "https://api.brevo.com/v3/smtp/email",
    init: {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: m.fromEmail, name: clip(m.fromName, 70) },
        to: [{ email: m.to }],
        subject: clip(m.subject, 998),
        htmlContent: m.html,
        ...(m.text ? { textContent: m.text } : {}),
        ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}),
        ...(Object.keys(m.headers).length ? { headers: m.headers } : {}),
      }),
    },
  };
}

/** Brevo: 201 com messageId é aceite; 4xx traz { code, message }. */
export function interpretBrevo(status: number, body: Row | null): ProviderResult {
  if (status === 201 || status === 200) {
    return { ok: true, status, detail: `Brevo ${status}${body?.messageId ? ` · ${body.messageId}` : ""}` };
  }
  const why = body?.message || body?.code || "erro";
  const hint = status === 401 ? " (chave da API inválida)"
    : status === 402 ? " (sem créditos de envio no plano)"
      : /sender/i.test(String(why)) ? " (o remetente tem de estar validado na Brevo)" : "";
  return { ok: false, status, detail: `Brevo ${status}: ${why}${hint}` };
}

export function cloudflareRequest(accountId: string, token: string, m: EmailMessage) {
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: m.to,
        // Na API REST o remetente é { address, name } (no binding dos Workers é { email, name }).
        from: { address: m.fromEmail, name: clip(m.fromName, 70) },
        subject: clip(m.subject, 998),
        html: m.html,
        ...(m.text ? { text: m.text } : {}),
        // Na API REST é `reply_to` (no binding dos Workers, `replyTo`); um `Reply-To` em
        // `headers` é recusado com E_HEADER_USE_API_FIELD e a mensagem não sai.
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        ...(Object.keys(m.headers).length ? { headers: m.headers } : {}),
      }),
    },
  };
}

const CLOUDFLARE_HINTS: Record<number, string> = {
  10101: "token inválido",
  10102: "o token não tem permissão de envio de email",
  10105: "a conta não tem o plano necessário (Workers Paid)",
  10203: "o envio de email não está activo para este domínio",
  10202: "endereço de email inválido",
  10004: "limite de envio atingido; volta a tentar",
};

/**
 * Cloudflare: `success` e, por destinatário, `delivered`, `queued` ou `permanent_bounces`.
 * Um destinatário em `permanent_bounces` é falha definitiva (não se repete).
 */
export function interpretCloudflare(status: number, body: Row | null, to: string): ProviderResult {
  if (status >= 200 && status < 300 && body?.success) {
    const r = body.result || {};
    const has = (list: unknown) => Array.isArray(list) && list.map((x) => String(x).toLowerCase()).includes(to.toLowerCase());
    if (has(r.permanent_bounces)) return { ok: false, status, permanent: true, detail: `Cloudflare: ${to} recusou permanentemente (endereço inexistente ou bloqueado)` };
    if (has(r.queued)) return { ok: true, status, detail: "Cloudflare: em fila de entrega" };
    return { ok: true, status, detail: "Cloudflare: entregue" };
  }
  const err = Array.isArray(body?.errors) ? body!.errors[0] : null;
  const code = Number(err?.code) || 0;
  return { ok: false, status, detail: `Cloudflare ${status}${code ? ` [${code}]` : ""}: ${CLOUDFLARE_HINTS[code] || err?.message || "erro"}` };
}

/** O fornecedor escolhido tem o que precisa para enviar? (sem dizer os valores). */
export function emailProviderReady(settings: Row | null, secrets: { brevo?: string; cloudflareToken?: string; sendgrid?: string }): { ready: boolean; missing: string } {
  const provider = String(settings?.email_provider || "smtp");
  if (!senderFor(settings).fromEmail) return { ready: false, missing: "email remetente" };
  if (provider === "brevo") return secrets.brevo ? { ready: true, missing: "" } : { ready: false, missing: "chave da API da Brevo" };
  if (provider === "cloudflare") {
    if (!String(settings?.cloudflare_account_id || "").trim()) return { ready: false, missing: "ID da conta Cloudflare" };
    return secrets.cloudflareToken ? { ready: true, missing: "" } : { ready: false, missing: "token da API do Cloudflare" };
  }
  if (provider === "sendgrid") return secrets.sendgrid ? { ready: true, missing: "" } : { ready: false, missing: "chave SendGrid" };
  if (!settings?.smtp_host) return { ready: false, missing: "servidor SMTP" };
  const port = Number(settings?.smtp_port) || 465;
  if (smtpPortProblem(port)) return { ready: false, missing: `porta SMTP utilizável (a ${port} está bloqueada)` };
  return { ready: true, missing: "" };
}
