import { describe, expect, it } from "vitest";
import { canalDeEnvio, emailEntrega, planearCanais, type Entrega } from "./campaigns.ts";

describe("emailEntrega", () => {
  it("exige o interruptor ligado", () => {
    expect(emailEntrega({ order_email_enabled: false, smtp_host: "smtp.exemplo.ao" })).toBe(false);
  });

  it("ligado sem fornecedor não entrega — é o estado mais enganador, porque o painel mostra verde", () => {
    expect(emailEntrega({ order_email_enabled: true })).toBe(false);
    expect(emailEntrega({ order_email_enabled: true, smtp_host: "" })).toBe(false);
  });

  it("smtp por omissão, sendgrid quando escolhido", () => {
    expect(emailEntrega({ order_email_enabled: true, smtp_host: "smtp.exemplo.ao" })).toBe(true);
    // Com o fornecedor em sendgrid, ter smtp_host não serve de nada.
    expect(emailEntrega({
      order_email_enabled: true, email_provider: "sendgrid", smtp_host: "smtp.exemplo.ao",
    })).toBe(false);
    expect(emailEntrega({
      order_email_enabled: true, email_provider: "sendgrid", sendgrid_api_key: "SG.x",
    })).toBe(true);
  });

  it("sem definições não entrega", () => {
    expect(emailEntrega(null)).toBe(false);
    expect(emailEntrega(undefined)).toBe(false);
  });
});

describe("planearCanais", () => {
  const nada: Entrega = { email: false, whatsapp: false };
  const tudo: Entrega = { email: true, whatsapp: true };

  it("canal vazio conta como whatsapp, como a Edge Function já fazia", () => {
    expect(planearCanais("", tudo).canais).toEqual(["whatsapp"]);
    expect(planearCanais(null, tudo).canais).toEqual(["whatsapp"]);
  });

  it("sem nada configurado não há canais e o motivo explica-se", () => {
    const p = planearCanais("both", nada);
    expect(p.canais).toEqual([]);
    expect(p.bloqueados).toEqual(["email", "whatsapp"]);
    expect(p.motivo).toContain("API do WhatsApp");
    expect(p.motivo).toContain("envio de email");
  });

  it("'both' com só um lado configurado reduz-se a esse lado", () => {
    const p = planearCanais("both", { email: true, whatsapp: false });
    expect(p.canais).toEqual(["email"]);
    expect(p.bloqueados).toEqual(["whatsapp"]);
    expect(canalDeEnvio(p)).toBe("email");
  });

  it("'both' com os dois configurados continua 'both'", () => {
    expect(canalDeEnvio(planearCanais("both", tudo))).toBe("both");
  });

  it("um canal pedido que não entrega fica sem canais — é o que impede os links mortos", () => {
    const p = planearCanais("whatsapp", { email: true, whatsapp: false });
    expect(p.canais).toEqual([]);
    expect(canalDeEnvio(p)).toBeNull();
    expect(p.motivo).toContain("whatsapp");
  });

  it("um canal desconhecido não passa a whatsapp por omissão", () => {
    const p = planearCanais("sms", tudo);
    expect(p.canais).toEqual([]);
    expect(p.motivo).toContain('canal desconhecido: "sms"');
  });

  it("nada bloqueado deixa o motivo vazio", () => {
    expect(planearCanais("email", tudo).motivo).toBe("");
  });
});
