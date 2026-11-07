import { describe, expect, it } from "vitest";
import {
  brevoRequest, cloudflareRequest, emailProviderReady, interpretBrevo, interpretCloudflare, smtpPortProblem,
} from "./emailProviders.ts";

const MSG = {
  to: "cliente@exemplo.ao", fromEmail: "loja@livrariaadventista.com", fromName: "Livraria Adventista",
  subject: "Teste", html: "<p>Olá</p>", text: "Olá",
  headers: { "List-Unsubscribe": "<https://livrariaadventista.com/unsubscribe?t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
};

describe("Brevo", () => {
  it("pedido no formato da API v3 (sender, to[], htmlContent, textContent, headers) com a chave no cabeçalho api-key", () => {
    const { url, init } = brevoRequest("xkeysib-123", MSG);
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("xkeysib-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      sender: { email: "loja@livrariaadventista.com", name: "Livraria Adventista" },
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
    expect(body.from).toEqual({ address: "loja@livrariaadventista.com", name: "Livraria Adventista" });
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
    const base = { smtp_from_email: "loja@livrariaadventista.com" };
    expect(emailProviderReady({ ...base, email_provider: "brevo" }, {})).toEqual({ ready: false, missing: "chave da API da Brevo" });
    expect(emailProviderReady({ ...base, email_provider: "brevo" }, { brevo: "k" })).toEqual({ ready: true, missing: "" });
    expect(emailProviderReady({ ...base, email_provider: "cloudflare" }, { cloudflareToken: "t" }).missing).toBe("ID da conta Cloudflare");
    expect(emailProviderReady({ ...base, email_provider: "cloudflare", cloudflare_account_id: "701800d0" }, { cloudflareToken: "t" }).ready).toBe(true);
    expect(emailProviderReady({ email_provider: "brevo" }, { brevo: "k" }).missing).toBe("email remetente");
  });
});
