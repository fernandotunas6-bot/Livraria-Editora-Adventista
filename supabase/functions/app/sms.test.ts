import { describe, expect, it, vi } from "vitest";
import {
  clipSms, isAngolaMobile, isVerifyService, maskedNumber, otpCode, otpHash, otpMessage, parsePro2smsResponse, parseSmsResponse, pro2smsRequest,
  pro2smsText, smsE164, smsErrorText, smsNotice, smsNumber, smsParts, smsProvider, smsSender, smsText, twilioRequest, verifyCheck, verifyOutcome,
  verifySend,
} from "./sms.ts";

describe("números", () => {
  it("aceita as formas de um telemóvel de Angola", () => {
    for (const n of ["923000000", "923 000 000", "+244 923 000 000", "244923000000", "00244923000000"]) {
      expect(smsNumber(n)).toBe("244923000000");
    }
  });
  it("recusa o que não é telemóvel", () => {
    for (const n of ["", "123", "222000000", "+244222000000", "92300000", "abc", null, undefined]) {
      expect(smsNumber(n)).toBe("");
    }
  });
  it("outro país só com + ou 00", () => {
    expect(smsNumber("+351913000000")).toBe("351913000000");
    expect(smsNumber("00351913000000")).toBe("351913000000");
    expect(smsNumber("351913000000")).toBe("");
  });
  it("só Angola conta como telemóvel nacional", () => {
    expect(isAngolaMobile("244923000000")).toBe(true);
    expect(isAngolaMobile("351913000000")).toBe(false);
  });
  it("mostra o número mascarado", () => {
    expect(maskedNumber("244923000123")).toBe("+244 9•• ••• 123");
    expect(maskedNumber("12")).toBe("•••");
  });
});

describe("texto", () => {
  it("tira acentos, emojis e o negrito do WhatsApp: fica em GSM, sem custar o dobro", () => {
    expect(smsText("✅ *Encomenda não é expedição — código ção*")).toBe("Encomenda nao e expedicao - codigo cao");
    expect(smsText("Olá «João» … €5")).toBe('Ola "Joao" ... EUR5');
    expect(smsText("só ASCII")).toMatch(/^[\x20-\x7e\n]*$/);
  });
  it("não estraga ligações", () => {
    expect(smsText("https://exemplo.ao/a_b?c=1")).toBe("https://exemplo.ao/a_b?c=1");
  });
  it("arruma os espaços", () => {
    expect(smsText("  a   b \n\n  c  ")).toBe("a b\nc");
    expect(smsText(null)).toBe("");
  });
  it("conta as partes como a operadora", () => {
    expect(smsParts("")).toBe(0);
    expect(smsParts("a".repeat(160))).toBe(1);
    expect(smsParts("a".repeat(161))).toBe(2);
    expect(smsParts("a".repeat(306))).toBe(2);
    expect(smsParts("a".repeat(307))).toBe(3);
    expect(smsParts(`${"a".repeat(159)}[`)).toBe(2); // o [ gasta dois
    expect(smsParts(`${"a".repeat(159)}{`)).toBe(2);
  });
  it("corta para caber, sem passar das partes pedidas", () => {
    expect(clipSms("curto")).toBe("curto");
    const longo = "palavra ".repeat(60).trim();
    expect(smsParts(clipSms(longo))).toBe(1);
    expect(smsParts(clipSms(longo, 2))).toBe(2);
    expect(clipSms(longo)).toMatch(/palavra\.\.\.$/);
  });
  it("num aviso, a ligação nunca fica cortada", () => {
    const link = "https://livrariaadventista.com/track";
    const texto = smsNotice({ title: "Encomenda expedida — LA-1", detail: "detalhe muito comprido ".repeat(20), link });
    expect(texto.endsWith(`\n${link}`)).toBe(true);
    expect(smsParts(texto)).toBe(1);
    expect(smsNotice({ title: "Só título" })).toBe("So titulo");
    expect(smsNotice({ title: "T", detail: "d" })).toBe("T: d");
  });
});

describe("serviço e resultado da Twilio Verify", () => {
  it("reconhece o identificador do serviço", () => {
    expect(isVerifyService(`VA${"0a".repeat(16)}`)).toBe(true);
    for (const v of ["", "VA123", `MG${"0a".repeat(16)}`, null, undefined]) expect(isVerifyService(v)).toBe(false);
  });
  it("só «approved» confirma", () => {
    expect(verifyOutcome({ ok: true, status: "approved" })).toBe("approved");
    expect(verifyOutcome({ ok: true, status: "pending" })).toBe("wrong");
    expect(verifyOutcome({ ok: true, status: "max_attempts_reached" })).toBe("attempts");
    for (const status of ["canceled", "expired", "deleted"]) expect(verifyOutcome({ ok: true, status })).toBe("expired");
  });
  it("erros: esgotado, já não existe, ou a Twilio em baixo", () => {
    expect(verifyOutcome({ ok: false, code: "60202" })).toBe("attempts");
    expect(verifyOutcome({ ok: false, code: "20404" })).toBe("expired");
    expect(verifyOutcome({ ok: false, code: "http_404" })).toBe("expired");
    expect(verifyOutcome({ ok: false, code: "sem_resposta" })).toBe("unavailable");
    expect(verifyOutcome({ ok: false, code: "20003" })).toBe("unavailable");
  });
});

describe("respostas da API", () => {
  it("sucesso: a mensagem criada", () => {
    expect(parseSmsResponse(201, { sid: "SM1", status: "queued", num_segments: "2", error_code: null }))
      .toEqual({ ok: true, id: "SM1", status: "queued", parts: 2 });
    expect(parseSmsResponse(201, { sid: "SM2", status: "accepted", num_segments: "0" }))
      .toEqual({ ok: true, id: "SM2", status: "accepted" });
  });
  it("erro, na forma real da Twilio", () => {
    expect(parseSmsResponse(401, { code: 20003, message: "auth account does not exist", more_info: "https://x", status: 401 }))
      .toEqual({ ok: false, code: "20003", error: "auth account does not exist" });
    expect(parseSmsResponse(500, null).code).toBe("http_500");
  });
  it("mensagem criada, mas já falhada, é uma falha", () => {
    expect(parseSmsResponse(201, { sid: "SM3", status: "failed", error_code: 30007, error_message: "Filtrada" }))
      .toEqual({ ok: false, code: "30007", error: "Filtrada" });
  });
  it("explica os erros em português, e diz o que fazer", () => {
    expect(smsErrorText("21408")).toContain("Geo Permissions");
    expect(smsErrorText("21608")).toContain("Conta de teste");
    expect(smsErrorText("20003")).toContain("TWILIO_AUTH_TOKEN");
    expect(smsErrorText("60203")).toContain("10 minutos");
    expect(smsErrorText("60410")).toContain("Fraud Guard");
    expect(smsErrorText("99999", "Outro")).toBe("Outro");
    expect(smsErrorText(undefined)).toBe("Não foi possível enviar a SMS.");
  });
  it("o remetente: nome, número ou serviço de mensagens", () => {
    expect(smsSender("LivrariaAdv")).toEqual({ From: "LivrariaAdv" });
    expect(smsSender("+15557122661")).toEqual({ From: "+15557122661" });
    const servico = `MG${"a".repeat(32)}`;
    expect(smsSender(servico)).toEqual({ MessagingServiceSid: servico });
  });
  it("o número vai com o +", () => {
    expect(smsE164("244923000000")).toBe("+244923000000");
  });
});

describe("pedido à API", () => {
  const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const cred = { sid: "AC123", token: "TOKEN-SECRETO" };

  it("o token vai no cabeçalho, e nunca no endereço nem no corpo", async () => {
    const fake = vi.fn(async () => resposta(201, { sid: "SM1", status: "queued" }));
    const r = await twilioRequest(cred, "/Messages.json", { To: "+244923000000", From: "LivrariaAdv", Body: "ola e adeus" }, fake as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(url).not.toContain("TOKEN-SECRETO");
    expect(String(init.body)).not.toContain("TOKEN-SECRETO");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("AC123:TOKEN-SECRETO")}`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("To")).toBe("+244923000000");
    expect(form.get("Body")).toBe("ola e adeus");
  });
  it("o código vai pela Twilio Verify, em português", async () => {
    const service = `VA${"0a".repeat(16)}`;
    const fake = vi.fn(async () => resposta(201, { sid: "VE1", status: "pending", valid: false }));
    const r = await verifySend(cred, service, "+244923000000", fake as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, id: "VE1", status: "pending" });
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://verify.twilio.com/v2/Services/${service}/Verifications`);
    expect(String(init.body)).not.toContain("TOKEN-SECRETO");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ To: "+244923000000", Channel: "sms", Locale: "pt" });
  });
  it("verificar o código usa o número e o código", async () => {
    const service = `VA${"0a".repeat(16)}`;
    const fake = vi.fn(async () => resposta(200, { sid: "VE1", status: "approved", valid: true }));
    const r = await verifyCheck(cred, service, "+244923000000", "123456", fake as unknown as typeof fetch);
    expect(verifyOutcome(r)).toBe("approved");
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`);
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ To: "+244923000000", Code: "123456" });
  });
  it("verificação que já não existe: 404", async () => {
    const fake = vi.fn(async () => resposta(404, { code: 20404, message: "not found", status: 404 }));
    expect(verifyOutcome(await verifyCheck(cred, "VA1", "+244923000000", "1", fake as unknown as typeof fetch))).toBe("expired");
  });
  it("sem formulário é GET", async () => {
    const fake = vi.fn(async () => resposta(200, { balance: "12.34", currency: "USD" }));
    const r = await twilioRequest(cred, "/Balance.json", undefined, fake as unknown as typeof fetch);
    expect((fake.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("GET");
    expect(r.body?.balance).toBe("12.34");
  });
  it("a falha de rede não lança, nem mostra o token", async () => {
    const fake = vi.fn(async () => { throw new Error("rede em baixo"); });
    const r = await twilioRequest(cred, "/Messages.json", {}, fake as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, code: "sem_resposta" });
    expect(JSON.stringify(r)).not.toContain("TOKEN-SECRETO");
  });
  it("uma resposta que não é JSON é um erro", async () => {
    const fake = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await twilioRequest(cred, "/Messages.json", {}, fake as unknown as typeof fetch)).toMatchObject({ ok: false, code: "http_502" });
  });
});

describe("escolher o serviço", () => {
  it("aceita os dois, e o resto vale o de omissão", () => {
    expect(smsProvider("twilio", "pro2sms")).toBe("twilio");
    expect(smsProvider("pro2sms", "twilio")).toBe("pro2sms");
    for (const v of ["", "outro", null, undefined]) expect(smsProvider(v, "pro2sms")).toBe("pro2sms");
  });
});

describe("códigos pela PRO2SMS", () => {
  it("6 dígitos", () => {
    for (let i = 0; i < 50; i++) expect(otpCode()).toMatch(/^\d{6}$/);
  });
  it("a mensagem cabe numa SMS e não leva acentos", () => {
    const m = otpMessage("Livraria Adventista", "123456");
    expect(m).toContain("123456");
    expect(smsParts(m)).toBe(1);
    expect(m).toMatch(/^[\x20-\x7e]*$/);
  });
  it("o resumo fica preso à conta, ao número e ao segredo", async () => {
    const a = await otpHash("u1", "244923000000", "123456", "segredo");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await otpHash("u1", "244923000000", "123456", "segredo")).toBe(a);
    expect(await otpHash("u2", "244923000000", "123456", "segredo")).not.toBe(a);
    expect(await otpHash("u1", "244923000001", "123456", "segredo")).not.toBe(a);
    expect(await otpHash("u1", "244923000000", "123457", "segredo")).not.toBe(a);
    expect(await otpHash("u1", "244923000000", "123456", "outro")).not.toBe(a);
  });
});

describe("respostas da PRO2SMS", () => {
  it("as duas formas de sucesso", () => {
    expect(parsePro2smsResponse(200, { success: true, sms_id: "SMS-1", status: "queued", cost: 1 }))
      .toEqual({ ok: true, id: "SMS-1", status: "queued" });
    expect(parsePro2smsResponse(200, { success: true, message_id: "P2S-1", status: "sent", parts: 2, charged: 19.98 }))
      .toEqual({ ok: true, id: "P2S-1", status: "sent", parts: 2 });
  });
  it("as duas formas de erro", () => {
    expect(parsePro2smsResponse(403, { code: "permission_denied", message: "Sem permissão", data: { status: 403 } }))
      .toEqual({ ok: false, code: "permission_denied", error: "Sem permissão" });
    expect(parsePro2smsResponse(403, { success: false, error: "sender_not_authorized", message: "Não aprovado" }))
      .toEqual({ ok: false, code: "sender_not_authorized", error: "Não aprovado" });
    expect(parsePro2smsResponse(200, { success: false, error: "x" }).ok).toBe(false);
    expect(parsePro2smsResponse(500, null).code).toBe("http_500");
  });
  it("explica os erros em português", () => {
    expect(smsErrorText("insufficient_balance")).toContain("Sem saldo na PRO2SMS");
    expect(smsErrorText("invalid_api_key")).toContain("PRO2SMS_API_KEY");
  });
  it("tira as chavetas: a PRO2SMS substituía {nome} por dados do contacto", () => {
    expect(pro2smsText("Ola {primeiro_nome}")).toBe("Ola primeiro_nome");
  });
});

describe("pedido à PRO2SMS", () => {
  const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("a chave vai no cabeçalho e nunca no endereço", async () => {
    const fake = vi.fn(async () => resposta(200, { success: true, sms_id: "S" }));
    const r = await pro2smsRequest("CHAVE-SECRETA", "/send", { to: "244923000000", message: "ola" }, fake as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://pro2sms.ao/wp-json/pro2sms/v2/send");
    expect(url).not.toContain("CHAVE-SECRETA");
    expect((init.headers as Record<string, string>)["X-PRO2SMS-Key"]).toBe("CHAVE-SECRETA");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ to: "244923000000", message: "ola" });
  });
  it("sem corpo é GET", async () => {
    const fake = vi.fn(async () => resposta(200, { success: true, balance: 0 }));
    const r = await pro2smsRequest("k", "/balance", undefined, fake as unknown as typeof fetch);
    expect((fake.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("GET");
    expect(r.body?.balance).toBe(0);
  });
  it("a falha de rede não lança, nem mostra a chave", async () => {
    const fake = vi.fn(async () => { throw new Error("rede em baixo"); });
    const r = await pro2smsRequest("CHAVE-SECRETA", "/send", {}, fake as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, code: "sem_resposta" });
    expect(JSON.stringify(r)).not.toContain("CHAVE-SECRETA");
  });
  it("uma resposta que não é JSON é um erro", async () => {
    const fake = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await pro2smsRequest("k", "/send", {}, fake as unknown as typeof fetch)).toMatchObject({ ok: false, code: "http_502" });
  });
});
