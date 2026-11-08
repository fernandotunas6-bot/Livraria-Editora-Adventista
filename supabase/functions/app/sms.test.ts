import { describe, expect, it, vi } from "vitest";
import {
  clipSms, isAngolaMobile, maskedNumber, otpCode, otpHash, otpMessage, parseSmsResponse, pro2smsRequest,
  smsErrorText, smsNotice, smsNumber, smsParts, smsText,
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
  it("tira as chavetas: a PRO2SMS substituía {nome} por dados do contacto", () => {
    expect(smsText("Olá {primeiro_nome}")).toBe("Ola primeiro_nome");
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

describe("códigos", () => {
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

describe("respostas da API", () => {
  it("as duas formas de sucesso", () => {
    expect(parseSmsResponse(200, { success: true, sms_id: "SMS-1", status: "queued", cost: 1 }))
      .toEqual({ ok: true, id: "SMS-1", status: "queued", charged: 1 });
    expect(parseSmsResponse(200, { success: true, message_id: "P2S-1", status: "sent", charged: 19.98 }))
      .toEqual({ ok: true, id: "P2S-1", status: "sent", charged: 19.98 });
  });
  it("as duas formas de erro", () => {
    expect(parseSmsResponse(403, { code: "permission_denied", message: "Sem permissão", data: { status: 403 } }))
      .toEqual({ ok: false, code: "permission_denied", error: "Sem permissão" });
    expect(parseSmsResponse(403, { success: false, error: "sender_not_authorized", message: "Não aprovado" }))
      .toEqual({ ok: false, code: "sender_not_authorized", error: "Não aprovado" });
    expect(parseSmsResponse(200, { success: false, error: "x" }).ok).toBe(false);
    expect(parseSmsResponse(500, null).code).toBe("http_500");
  });
  it("explica os erros em português", () => {
    expect(smsErrorText("insufficient_balance")).toContain("Sem saldo");
    expect(smsErrorText("desconhecido", "Outro")).toBe("Outro");
    expect(smsErrorText(undefined)).toBe("Não foi possível enviar a SMS.");
  });
});

describe("pedido à API", () => {
  const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("a chave vai no cabeçalho e nunca no endereço", async () => {
    const fake = vi.fn(async () => resposta(200, { success: true, sms_id: "S" }));
    const r = await pro2smsRequest("CHAVE-SECRETA", "/send", { body: { to: "244923000000", message: "ola" } }, fake as unknown as typeof fetch);
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
    const r = await pro2smsRequest("k", "/balance", {}, fake as unknown as typeof fetch);
    expect((fake.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("GET");
    expect(r.body?.balance).toBe(0);
  });
  it("a falha de rede não lança, nem mostra a chave", async () => {
    const fake = vi.fn(async () => { throw new Error("rede em baixo"); });
    const r = await pro2smsRequest("CHAVE-SECRETA", "/send", { body: {} }, fake as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, code: "sem_resposta" });
    expect(JSON.stringify(r)).not.toContain("CHAVE-SECRETA");
  });
  it("uma resposta que não é JSON é um erro", async () => {
    const fake = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await pro2smsRequest("k", "/send", { body: {} }, fake as unknown as typeof fetch)).toMatchObject({ ok: false, code: "http_502" });
  });
});
