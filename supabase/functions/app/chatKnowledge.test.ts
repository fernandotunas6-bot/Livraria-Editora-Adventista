// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import { FAQ_SECTIONS as SITE_FAQ } from "../../../app/web/src/lib/faqData.js";
import { FAQ_SECTIONS, buildKnowledge, knowledgeText, kz } from "./chatKnowledge.ts";

describe("chatKnowledge", () => {
  it("as perguntas frequentes do assistente são as mesmas do site (se mudar uma, copie para chatKnowledge.ts)", () => {
    const strip = (sections: any[]) => sections.map((s) => ({
      category: s.category,
      questions: s.questions.map((q: any) => ({ question: q.question, answer: q.answer })),
    }));
    expect(strip(FAQ_SECTIONS)).toEqual(strip(SITE_FAQ));
  });

  it("portes com as regras do place_order: normal 1500 e expressa o dobro quando vazias", () => {
    const k = buildKnowledge({}, [], []);
    expect(k.shippingCost).toBe(1500);
    expect(k.expressCost).toBe(3000);
    expect(k.freeThreshold).toBe(20000);
    expect(buildKnowledge({ shipping_cost: 2000, shipping_express_cost: 4500, shipping_free_threshold: 30000 }).expressCost).toBe(4500);
  });

  it("só métodos de pagamento activos e lojas activas", () => {
    const k = buildKnowledge(null,
      [{ name: "Transferência", enabled: true }, { name: "Cartão", enabled: false }],
      [{ name: "Loja Huambo", active: true, address: "Rua A", province: "Huambo" }, { name: "Fechada", active: false }]);
    expect(k.paymentMethods.map((m) => m.name)).toEqual(["Transferência"]);
    expect(k.stores.map((s) => s.name)).toEqual(["Loja Huambo"]);
    const text = knowledgeText(k);
    expect(text).toContain("Loja Huambo");
    expect(text).not.toContain("Cartão");
    expect(text).not.toContain("{free_threshold}");
  });

  it("formata kwanzas sem depender do runtime", () => {
    expect(kz(20000)).toBe("20 000 Kz");
    expect(kz(1500)).toBe("1 500 Kz");
  });

  it("portes a 0 (entrega grátis) valem 0, como no checkout; vazio usa o valor por omissão", () => {
    const k = buildKnowledge({ shipping_cost: 0, shipping_express_cost: "" });
    expect(k.shippingCost).toBe(0);
    expect(k.expressCost).toBe(0);
    expect(knowledgeText(k)).toContain("Entrega ao domicílio: grátis");
    expect(buildKnowledge({ shipping_cost: "" }).shippingCost).toBe(1500);
  });
});
