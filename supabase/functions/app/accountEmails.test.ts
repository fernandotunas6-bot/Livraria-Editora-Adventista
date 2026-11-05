import { describe, expect, it } from "vitest";
import { brandFromSettings, emailDocument, SAFE_SYMBOLS, type Brand } from "./emails.ts";
import {
  accountClosedLetter,
  accountStatusLetter,
  applyOverride,
  cleanOverride,
  emailChangedLetter,
  fillPlaceholders,
  newLoginLetter,
  orderStatusLetter,
  overrideFromLetter,
  refundLetter,
  suspiciousActivityLetter,
  EDITABLE_TEMPLATES,
  PREVIEW_TEMPLATES,
} from "./emailTemplates.ts";

const brand: Brand = brandFromSettings({ site_name: "Livraria Adventista", primary_color: "#0ea5c9" }, "https://loja.exemplo.ao");

const order = {
  id: "o1",
  order_number: "LA-2026-0100",
  customer_name: "João Manuel",
  customer_email: "joao@exemplo.ao",
  items: [{ quantity: 1, title: "Caminho a Cristo", price: 2500 }],
  total: 4000,
  shipping_cost: 1500,
  payment_method_name: "Multicaixa Express",
  shipping_method: "delivery",
};

describe("modelos de conta e segurança", () => {
  it("alteração de email diz qual é o endereço novo e oferece recuperar o acesso", () => {
    const l = emailChangedLetter(brand, "Ana Paula", "ana.nova@exemplo.ao");
    expect(l.key).toBe("email_changed");
    expect(l.doc.details?.find((d) => d.label === "Endereço novo")?.value).toBe("ana.nova@exemplo.ao");
    expect(l.doc.cta?.url).toBe("https://loja.exemplo.ao/forgot-password");
    // Pedido pelo cliente: ainda falta confirmar; feito pela equipa: já está feito.
    expect(l.doc.lead?.join(" ")).toMatch(/confirmada no endereço novo/);
    expect(emailChangedLetter(brand, "Ana", "x@y.ao", true).doc.lead?.join(" ")).toMatch(/equipa da loja mudou/);
  });

  it("novo acesso mostra o aparelho e leva à segurança da conta", () => {
    const l = newLoginLetter(brand, "Ana", { device: "Chrome em Android", when: "2026-11-05T08:30:00Z", ip: "102.214.0.10" });
    const { text } = emailDocument(brand, l.doc);
    expect(text).toContain("Chrome em Android");
    expect(text).toContain("102.214.0.10");
    expect(l.doc.cta?.url).toBe("https://loja.exemplo.ao/profile?tab=security");
  });

  it("actividade suspeita inclui a nota da equipa quando há", () => {
    const l = suspiciousActivityLetter(brand, "Ana", "Houve várias tentativas de entrada a partir de outro país.");
    expect(l.doc.tone).toBe("danger");
    expect(l.doc.lead).toContain("Houve várias tentativas de entrada a partir de outro país.");
    expect(suspiciousActivityLetter(brand, "Ana").doc.lead?.length).toBe(3);
  });

  it("suspensão e reactivação são modelos diferentes", () => {
    expect(accountStatusLetter(brand, "Ana", true).key).toBe("account_suspended");
    expect(accountStatusLetter(brand, "Ana", false).key).toBe("account_reactivated");
    expect(accountStatusLetter(brand, "Ana", false).doc.cta?.url).toBe("https://loja.exemplo.ao/login");
  });

  it("encerramento lembra que as encomendas continuam acessíveis", () => {
    const l = accountClosedLetter(brand, "Ana");
    expect(l.doc.lead?.join(" ")).toMatch(/encomendas que fez continuam registadas/);
    expect(l.doc.cta?.url).toBe("https://loja.exemplo.ao/track");
  });

  it("reembolso usa o total da encomenda, ou o valor reembolsado quando é parcial", () => {
    const total = refundLetter(brand, order);
    expect(total.doc.details?.find((d) => d.label === "Valor reembolsado")?.value).toBe("4.000,00 Kz");
    const partial = refundLetter(brand, { ...order, refund_amount: 2500 });
    expect(partial.doc.details?.find((d) => d.label === "Valor reembolsado")?.value).toBe("2.500,00 Kz");
    expect(total.subject).toBe("Reembolso da encomenda LA-2026-0100");
  });

  it("todos os modelos novos usam símbolos que os tipos de letra desenham", () => {
    for (const l of [
      emailChangedLetter(brand, "A", "a@b.ao"), newLoginLetter(brand, "A", {}), suspiciousActivityLetter(brand, "A"),
      accountStatusLetter(brand, "A", true), accountStatusLetter(brand, "A", false), accountClosedLetter(brand, "A"),
      refundLetter(brand, order),
    ]) {
      expect(SAFE_SYMBOLS).toContain(l.doc.symbol);
    }
  });
});

describe("catálogo e editor", () => {
  it("cada modelo editável compõe uma mensagem com a sua própria chave", () => {
    // Se a chave da mensagem real não for a da pré-visualização, o texto editado no painel
    // aparecia na pré-visualização e nunca chegava aos clientes.
    for (const key of EDITABLE_TEMPLATES) {
      expect(PREVIEW_TEMPLATES[key].build(brand).key, key).toBe(key);
    }
  });

  it("campanhas e teste não são editáveis", () => {
    expect(EDITABLE_TEMPLATES).not.toContain("campaign");
    expect(EDITABLE_TEMPLATES).not.toContain("test");
  });
});

describe("textos editados", () => {
  it("cleanOverride fica só com texto conhecido, cortado e sem vazios", () => {
    expect(cleanOverride(null)).toBeNull();
    expect(cleanOverride({ subject: "   ", title: 3, other: "x" })).toBeNull();
    const o = cleanOverride({ subject: "a".repeat(400), lead: "Um\n\nDois" });
    expect(o?.subject?.length).toBe(150);
    expect(o?.lead).toBe("Um\n\nDois");
  });

  it("o assunto não aceita quebras de linha (injecção de cabeçalhos)", () => {
    const o = cleanOverride({ subject: "Olá\r\nBcc: alguem@mal.ao" });
    expect(o?.subject).not.toMatch(/[\r\n]/);
    const l = applyOverride(refundLetter(brand, order), { subject: "Olá\r\nBcc: x@y.ao" });
    expect(l.subject).not.toMatch(/[\r\n]/);
  });

  it("marcadores conhecidos são trocados; desconhecidos ficam à vista", () => {
    expect(fillPlaceholders("Olá {nome}, {xpto}", { nome: "Ana" })).toBe("Olá Ana, {xpto}");
  });

  it("applyOverride troca o texto e mantém os dados da encomenda", () => {
    const base = refundLetter(brand, order);
    const l = applyOverride(base, {
      subject: "Devolvemos {total} — {encomenda}",
      title: "Está devolvido",
      lead: "Olá {nome}.\n\nObrigado pela paciência.",
    });
    expect(l.subject).toBe("Devolvemos 4.000,00 Kz — LA-2026-0100");
    expect(l.doc.title).toBe("Está devolvido");
    expect(l.doc.lead).toEqual(["Olá João.", "Obrigado pela paciência."]);
    expect(l.doc.details).toEqual(base.doc.details);
    expect(l.doc.cta).toEqual(base.doc.cta);
    // O subtítulo não foi editado: fica o de origem.
    expect(l.doc.subtitle).toBe(base.doc.subtitle);
  });

  it("sem texto editado, a mensagem sai igual", () => {
    const base = refundLetter(brand, order);
    expect(applyOverride(base, null)).toBe(base);
  });

  it("o texto de origem do editor vem com marcadores, não com os dados do exemplo", () => {
    const src = overrideFromLetter(PREVIEW_TEMPLATES.order_paid.build(brand));
    expect(src.subject).toBe("Encomenda {encomenda} confirmada");
    expect(src.lead).toContain("{nome}");
    expect(src.lead).toContain("{loja}");
    expect(src.lead).not.toContain("Maria");
  });

  it("editar a partir do texto de origem dá a mesma mensagem para outro cliente", () => {
    const src = overrideFromLetter(PREVIEW_TEMPLATES.order_paid.build(brand));
    const real = orderStatusLetter(brand, { ...order, payment_status: "paid" }, "delivered")!;
    const editedSrc = overrideFromLetter(PREVIEW_TEMPLATES.delivered.build(brand));
    const l = applyOverride(real, { lead: editedSrc.lead });
    expect(l.doc.lead?.join(" ")).toContain("Olá, João!");
    expect(src.subject).not.toContain("LA-2026-0042");
  });
});
