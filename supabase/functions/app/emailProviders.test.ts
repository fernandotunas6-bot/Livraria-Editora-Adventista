// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import {
  brevoRequest, cloudflareRequest, emailProviderReady, interpretBrevo, interpretCloudflare, senderFor, smtpPortProblem,
} from "./emailProviders.ts";

const MSG = {
  to: "cliente@exemplo.ao", fromEmail: "loja@livrariaadventista.ao", fromName: "Livraria Adventista",
  subject: "Teste", html: "<p>Olá</p>", text: "Olá",
  headers: { "List-Unsubscribe": "<https://livrariaadventista.ao/unsubscribe?t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
};

describe("Brevo", () => {
  it("pedido no formato da API v3 (sender, to[], htmlContent, textContent, headers) com a chave no cabeçalho api-key", () => {
    const { url, init } = brevoRequest("xkeysib-123", MSG);
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("xkeysib-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      sender: { email: "loja@livrariaadventista.ao", name: "Livraria Adventista" },
      to: [{ email: "cliente@exemplo.ao" }], subject: "Teste", htmlContent: "<p>Olá</p>", textContent: "Olá",
    });
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("201 é aceite; 401/402/remetente dizem o que corrigir", () => {
    expect(interpretBrevo(201, { messageId: "<abc@smtp-relay>" })).toMatchObject({ ok: true });
    expect(interpretBrevo(401, { code: "unauthorized", message: "Key not found" }).detail).toContain("chave da API inválida");
    expect(interpretBrevo(402, { message: "not enough credits" }).detail).toContain("sem créditos");
    expect(interpretBrevo(400, { code: "invalid_parameter", message: "sender is not valid" }).detail).toContain("validado na Brevo");
  });
});

describe("Cloudflare Email Sending", () => {
  it("pedido REST: from é { address, name } (não { email }), token Bearer, conta no caminho", () => {
    const { url, init } = cloudflareRequest("701800d0", "tok", MSG);
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/701800d0/email/sending/send");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.from).toEqual({ address: "loja@livrariaadventista.ao", name: "Livraria Adventista" });
    expect(body).toMatchObject({ to: "cliente@exemplo.ao", subject: "Teste", html: "<p>Olá</p>", text: "Olá" });
  });

  it("entregue e em fila contam como enviados; recusa permanente não se repete", () => {
    const ok = { success: true, errors: [], result: { delivered: ["cliente@exemplo.ao"], permanent_bounces: [], queued: [] } };
    expect(interpretCloudflare(200, ok, "cliente@exemplo.ao")).toMatchObject({ ok: true, detail: "Cloudflare: entregue" });
    const queued = { success: true, result: { delivered: [], permanent_bounces: [], queued: ["Cliente@Exemplo.ao"] } };
    expect(interpretCloudflare(200, queued, "cliente@exemplo.ao").detail).toContain("fila");
    const bounce = { success: true, result: { delivered: [], permanent_bounces: ["cliente@exemplo.ao"], queued: [] } };
    expect(interpretCloudflare(200, bounce, "cliente@exemplo.ao")).toMatchObject({ ok: false, permanent: true });
  });

  it("erros com o motivo em português (plano, permissão, domínio)", () => {
    const err = (code: number) => ({ success: false, errors: [{ code, message: "x" }], result: null });
    expect(interpretCloudflare(403, err(10105), "a@b.ao").detail).toContain("Workers Paid");
    expect(interpretCloudflare(403, err(10203), "a@b.ao").detail).toContain("não está activo");
    expect(interpretCloudflare(401, err(10101), "a@b.ao").detail).toContain("token inválido");
  });
});

describe("configuração", () => {
  it("SMTP nas portas 25 e 587 é recusado à partida (bloqueadas nas Edge Functions)", () => {
    expect(smtpPortProblem(587)).toContain("bloqueada");
    expect(smtpPortProblem(25)).toContain("bloqueada");
    expect(smtpPortProblem(465)).toBe("");
    expect(emailProviderReady({ email_provider: "smtp", smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_from_email: "a@b.ao" }, {}))
      .toEqual({ ready: false, missing: "porta SMTP utilizável (a 587 está bloqueada)" });
  });

  it("diz o que falta em cada fornecedor", () => {
    const base = { smtp_from_email: "loja@livrariaadventista.ao" };
    expect(emailProviderReady({ ...base, email_provider: "brevo" }, {})).toEqual({ ready: false, missing: "chave da API da Brevo" });
    expect(emailProviderReady({ ...base, email_provider: "brevo" }, { brevo: "k" })).toEqual({ ready: true, missing: "" });
    expect(emailProviderReady({ ...base, email_provider: "cloudflare" }, { cloudflareToken: "t" }).missing).toBe("ID da conta Cloudflare");
    expect(emailProviderReady({ ...base, email_provider: "cloudflare", cloudflare_account_id: "701800d0" }, { cloudflareToken: "t" }).ready).toBe(true);
    expect(emailProviderReady({ email_provider: "brevo" }, { brevo: "k" }).missing).toBe("email remetente");
    // nada configurado (o padrão é SMTP sem servidor): aponta a Brevo, a recomendada
    expect(emailProviderReady({ ...base, email_provider: "smtp" }, {}).missing).toContain("Brevo");
  });
});

describe("remetente e resposta", () => {
  it("remetente: o do painel, senão o email de contacto; nunca um domínio que não é o da loja", () => {
    expect(senderFor({ smtp_from_email: "loja@livrariaadventista.ao", contact_email: "contacto@livrariaadventista.ao" }).fromEmail)
      .toBe("loja@livrariaadventista.ao");
    expect(senderFor({ smtp_from_email: "", contact_email: "contacto@livrariaadventista.ao" }).fromEmail)
      .toBe("contacto@livrariaadventista.ao");
    // Antes caía em noreply@livraria.ao: sem nenhum dos dois, não há remetente.
    expect(senderFor({ smtp_from_email: "", contact_email: "" }).fromEmail).toBe("");
    expect(senderFor(null).fromEmail).toBe("");
    expect(senderFor({ smtp_from_email: "sem arroba", contact_email: "" }).fromEmail).toBe("");
    expect(emailProviderReady({ email_provider: "brevo", smtp_from_email: "sem arroba" }, { brevo: "k" }).missing).toBe("email remetente");
  });

  it("responder para: o contacto, só quando o remetente é outro endereço", () => {
    const loja = senderFor({ smtp_from_email: "loja@livrariaadventista.ao", contact_email: "contacto@livrariaadventista.ao" });
    expect(loja.replyTo).toBe("contacto@livrariaadventista.ao");
    expect(senderFor({ smtp_from_email: "Contacto@LivrariaAdventista.ao", contact_email: "contacto@livrariaadventista.ao" }).replyTo).toBe("");
    expect(senderFor({ smtp_from_email: "", contact_email: "contacto@livrariaadventista.ao" }).replyTo).toBe("");
    expect(senderFor({ smtp_from_email: "loja@livrariaadventista.ao", contact_email: "inválido" }).replyTo).toBe("");
  });

  it("nome: o do painel, senão o da loja, com o limite das APIs", () => {
    expect(senderFor({ smtp_from_name: "Livraria Adventista · Luanda" }).fromName).toBe("Livraria Adventista · Luanda");
    expect(senderFor({ site_name: "Livraria" }).fromName).toBe("Livraria");
    expect(senderFor({}).fromName).toBe("Livraria Adventista");
    expect(senderFor({ smtp_from_name: "x".repeat(90) }).fromName).toHaveLength(70);
  });

  it("o responder-para vai no campo de cada API (Cloudflare recusa Reply-To em headers)", () => {
    const withReply = { ...MSG, replyTo: "contacto@livrariaadventista.ao" };
    expect(JSON.parse(brevoRequest("k", withReply).init.body).replyTo).toEqual({ email: "contacto@livrariaadventista.ao" });
    const cf = JSON.parse(cloudflareRequest("acc", "tok", withReply).init.body);
    expect(cf.reply_to).toBe("contacto@livrariaadventista.ao");
    expect(cf.headers["Reply-To"]).toBeUndefined();
    expect(JSON.parse(brevoRequest("k", MSG).init.body).replyTo).toBeUndefined();
    expect(JSON.parse(cloudflareRequest("acc", "tok", MSG).init.body).reply_to).toBeUndefined();
  });
});
