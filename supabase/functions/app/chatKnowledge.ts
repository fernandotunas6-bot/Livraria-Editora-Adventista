// O que o assistente sabe da loja.
//
// Duas origens, e só estas: o texto aprovado (as perguntas frequentes e a política de envios e
// devoluções, iguais às páginas do site) e os dados vivos da base de dados (valores dos
// portes, contactos, métodos de pagamento activos, lojas). O assistente não responde com
// mais nada sobre a loja: se a resposta não está aqui, diz que não sabe e oferece a equipa.
//
// As perguntas frequentes repetem app/web/src/lib/faqData.js porque a Edge Function só é
// publicada quando muda `supabase/` (deploy-supabase.yml) e não pode importar o site. O
// chatKnowledge.test.ts falha se as duas deixarem de dizer o mesmo.

import { settingNumber } from "./checkoutRules.ts";

type Row = Record<string, any>;

export const FAQ_SECTIONS = [
  {
    category: "Encomendas e Envios",
    questions: [
      { question: "Quanto tempo demora a entrega?", answer: "A entrega padrão demora 5 a 7 dias úteis em Luanda e 7 a 14 dias para outras províncias. A entrega expressa demora 24 a 48 horas em Luanda." },
      { question: "Oferecem envio grátis?", answer: "Sim, envio grátis para encomendas acima de {free_threshold} em todo o território nacional." },
      { question: "Posso acompanhar a minha encomenda?", answer: "Sim! Use a página Rastrear Encomenda com o número e email da compra." },
    ],
  },
  {
    category: "Devoluções",
    questions: [
      { question: "Qual é a política de devolução?", answer: "Aceitamos devoluções em até 30 dias, desde que o livro esteja em bom estado e na embalagem original." },
      { question: "Como inicio uma devolução?", answer: "Use o formulário da página de Contacto e indique o número da encomenda." },
    ],
  },
  {
    category: "Pagamentos",
    questions: [
      { question: "Que métodos de pagamento aceitam?", answer: "Transferência bancária, Multicaixa Express e pagamento na entrega (conforme zona)." },
      { question: "Os meus dados estão seguros?", answer: "Sim, utilizamos ligações encriptadas e não armazenamos dados de cartão nos nossos servidores." },
    ],
  },
];

/** Página Envios e Devoluções (app/web/src/pages/ShippingReturnsPage.jsx), em frases. */
export const SHIPPING_POLICY = [
  "Entrega ao domicílio: {shipping_cost} por encomenda, em todo o território nacional; grátis acima de {free_threshold}.",
  "Entrega expressa: {express_cost}, com prioridade, 24 a 48 horas em Luanda.",
  "Levantamento na loja: grátis; o cliente escolhe a loja no checkout.",
  "Prazos: Luanda 5 a 7 dias úteis; outras províncias 7 a 14 dias úteis; expressa 24 a 48 horas em Luanda. A contagem começa depois de a encomenda ser confirmada.",
  "Devoluções: até 30 dias a contar da entrega, com o livro em bom estado e na embalagem original.",
  "Como devolver: escrever pela página de Contacto com o número da encomenda; a recolha ou a entrega numa das lojas físicas é combinada com o cliente; o reembolso é feito depois de a loja receber e conferir o livro.",
];

/** As mesmas regras do place_order: normal 1500 Kz se vazia; expressa, o dobro da normal se vazia. */
const DEFAULTS = { free: 20000, shipping: 1500 };

export type Knowledge = {
  siteName: string;
  freeThreshold: number;
  shippingCost: number;
  expressCost: number;
  whatsapp: string;
  phone: string;
  email: string;
  address: string;
  paymentMethods: { name: string; instructions: string }[];
  stores: { name: string; province: string; address: string; phone: string; hours: string }[];
};

const str = (value: unknown, max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Kz com espaço como separador de milhares (como no site), igual em qualquer runtime. */
export function kz(value: number) {
  const n = Math.round(value);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kz`;
}

export function buildKnowledge(settings: Row | null, paymentMethods: Row[] = [], stores: Row[] = []): Knowledge {
  // As mesmas regras do checkout (checkoutRules.settingNumber e place_order): 0 é um valor válido
  // (entrega grátis); só o campo vazio usa o valor por omissão. Expressa por configurar = dobro.
  const shippingCost = settingNumber(settings?.shipping_cost, DEFAULTS.shipping);
  const express = settingNumber(settings?.shipping_express_cost, 0);
  return {
    siteName: str(settings?.site_name, 80) || "Livraria Adventista",
    freeThreshold: settingNumber(settings?.shipping_free_threshold, DEFAULTS.free),
    shippingCost,
    expressCost: express > 0 ? express : shippingCost * 2,
    whatsapp: str(settings?.whatsapp, 40),
    phone: str(settings?.contact_phone, 40),
    email: str(settings?.contact_email, 120),
    address: str(settings?.contact_address, 200),
    paymentMethods: paymentMethods
      .filter((m) => m && m.enabled !== false && str(m.name))
      .map((m) => ({ name: str(m.name, 80), instructions: str(m.instructions, 300) })),
    stores: stores
      .filter((s) => s && s.active !== false && str(s.name))
      .map((s) => ({
        name: str(s.name, 100), province: str(s.province, 60), address: str(s.address, 200),
        phone: str(s.phone, 40), hours: str(s.hours, 120),
      })),
  };
}

/** Valor dos portes em texto: 0 é "grátis", não "0 Kz". */
export const shippingText = (value: number) => (value > 0 ? kz(value) : "grátis");

function fill(text: string, k: Knowledge) {
  return text
    .replaceAll("{free_threshold}", kz(k.freeThreshold))
    .replaceAll("{shipping_cost}", shippingText(k.shippingCost))
    .replaceAll("{express_cost}", shippingText(k.expressCost));
}

export const faqAnswers = (k: Knowledge) =>
  FAQ_SECTIONS.flatMap((s) => s.questions.map((q) => ({ category: s.category, question: q.question, answer: fill(q.answer, k) })));

export const shippingPolicy = (k: Knowledge) => SHIPPING_POLICY.map((line) => fill(line, k));

/** O conhecimento em texto, para o pedido à IA. */
export function knowledgeText(k: Knowledge): string {
  const lines: string[] = [];
  lines.push(`Loja: ${k.siteName} (livraria adventista em Angola; preços em kwanzas, Kz).`);
  const contacts = [
    k.whatsapp && `WhatsApp ${k.whatsapp}`,
    k.phone && `telefone ${k.phone}`,
    k.email && `email ${k.email}`,
    k.address && `morada ${k.address}`,
  ].filter(Boolean);
  if (contacts.length) lines.push(`Contactos: ${contacts.join("; ")}.`);
  lines.push("", "Envios e devoluções:", ...shippingPolicy(k).map((l) => `- ${l}`));
  if (k.paymentMethods.length) {
    lines.push("", "Métodos de pagamento activos no checkout:");
    for (const m of k.paymentMethods) lines.push(`- ${m.name}${m.instructions ? `: ${m.instructions}` : ""}`);
  }
  if (k.stores.length) {
    lines.push("", "Lojas físicas:");
    for (const s of k.stores) {
      lines.push(`- ${s.name} — ${[s.address, s.province].filter(Boolean).join(", ")}${s.hours ? `; horário: ${s.hours}` : ""}${s.phone ? `; telefone ${s.phone}` : ""}`);
    }
  }
  lines.push("", "Perguntas frequentes:");
  for (const f of faqAnswers(k)) lines.push(`- ${f.question} ${f.answer}`);
  return lines.join("\n");
}
