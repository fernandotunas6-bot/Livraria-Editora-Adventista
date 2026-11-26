// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Access, equipa, permissao, permissaoCom, publica, recusa, segredo, sessao } from "./access.ts";
import { type Auth, PERMISSION_KEYS } from "./permissions.ts";

const admin: Auth = { id: "1", email: "a@b.ao", role: "admin", permissions: {} };
const gestor = (permissions: Record<string, unknown>): Auth => ({ id: "2", email: "g@b.ao", role: "manager", permissions });
const cliente: Auth = { id: "3", email: "c@b.ao", role: "member", permissions: { manage_users: true } };
const visitante: Auth = null;

describe("recusa", () => {
  it("as rotas abertas deixam passar toda a gente", () => {
    for (const quem of [visitante, cliente, gestor({}), admin]) {
      expect(recusa(publica("teste"), quem)).toBeNull();
      expect(recusa(segredo("teste"), quem)).toBeNull();
    }
  });

  it("sessão: 401 sem conta, com a mensagem da rota; qualquer conta passa", () => {
    expect(recusa(sessao("Entre na sua conta."), visitante)).toEqual({ status: 401, message: "Entre na sua conta." });
    expect(recusa(sessao(), visitante)).toEqual({ status: 401, message: "Sessão necessária." });
    expect(recusa(sessao(), { ...cliente!, id: "" })).toEqual({ status: 401, message: "Sessão necessária." });
    expect(recusa(sessao(), cliente)).toBeNull();
    expect(recusa(sessao(), admin)).toBeNull();
  });

  it("equipa: admin e gestor passam, mesmo sem permissões; o resto leva 403", () => {
    expect(recusa(equipa(), admin)).toBeNull();
    expect(recusa(equipa(), gestor({}))).toBeNull();
    expect(recusa(equipa("Acesso negado."), cliente)).toEqual({ status: 403, message: "Acesso negado." });
    expect(recusa(equipa(), visitante)).toEqual({ status: 403, message: "Sem permissão para esta operação." });
  });

  it("permissão: basta uma das chaves; o admin tem todas; sem sessão é 403, como antes", () => {
    const encomendasOuColportores = permissao("manage_orders", "manage_colporteurs");
    expect(recusa(encomendasOuColportores, gestor({ manage_colporteurs: true }))).toBeNull();
    expect(recusa(encomendasOuColportores, gestor({ manage_orders: true }))).toBeNull();
    expect(recusa(encomendasOuColportores, admin)).toBeNull();
    expect(recusa(encomendasOuColportores, gestor({ manage_users: true })))
      .toEqual({ status: 403, message: "Sem permissão para esta operação." });
    expect(recusa(encomendasOuColportores, visitante)).toEqual({ status: 403, message: "Sem permissão para esta operação." });
  });

  it("um cliente não passa, nem com a permissão escrita no perfil", () => {
    expect(recusa(permissao("manage_users"), cliente)?.status).toBe(403);
  });

  it("só o booleano true conta, como em can()", () => {
    expect(recusa(permissao("manage_orders"), gestor({ manage_orders: "true" }))?.status).toBe(403);
    expect(recusa(permissao("manage_orders"), gestor({ manage_orders: 1 }))?.status).toBe(403);
  });

  it("a mensagem da recusa é a que a rota já dava", () => {
    expect(recusa(permissaoCom("Sem permissão.", "manage_payments"), gestor({}))).toEqual({ status: 403, message: "Sem permissão." });
  });

  it("um tipo de acesso desconhecido fecha, nunca abre", () => {
    expect(recusa({ kind: "aberta-por-engano" } as unknown as Access, admin)).toEqual({ status: 403, message: "Sem permissão para esta operação." });
  });

  it("uma rota aberta tem de dizer porquê, e uma de permissão tem de ter chave", () => {
    expect(() => publica("  ")).toThrow();
    expect(() => segredo("")).toThrow();
    expect(() => permissao()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// As rotas do index.ts, lidas do próprio ficheiro: o index.ts não se importa aqui (arranca o
// Deno.serve e lê os segredos do ambiente), mas o registo de cada rota é uma linha só.
// ---------------------------------------------------------------------------
// Um caminho, não um `new URL`: no ambiente jsdom dos testes, o `URL` é o do jsdom, e o `fs` recusa-o.
const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
const REGISTO = /^route\("(GET|POST)", "([^"]+)", (publica|segredo|sessao|equipa|permissao|permissaoCom)\((.*?)\), async /gm;
const rotas = [...fonte.matchAll(REGISTO)].map(([, metodo, caminho, tipo, args]) => ({ rota: `${metodo} ${caminho}`, tipo, args }));

describe("o registo das rotas no index.ts", () => {
  it("todas as rotas declaram o acesso", () => {
    const registos = fonte.match(/^route\(/gm) || [];
    expect(rotas.length).toBeGreaterThan(90);
    // Uma rota registada de outra forma (noutra linha, sem acesso) não passa no padrão e fica de fora daqui.
    expect(rotas.length).toBe(registos.length);
  });

  it("nenhuma rota se repete", () => {
    expect(new Set(rotas.map((r) => r.rota)).size).toBe(rotas.length);
  });

  it("o acesso é conferido no encaminhamento, antes de o handler correr", () => {
    const serve = fonte.slice(fonte.indexOf("Deno.serve("));
    const porta = serve.indexOf("recusa(entry.access, auth)");
    const handler = serve.indexOf("entry.handler(");
    expect(porta).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(porta);
  });

  it("as permissões pedidas existem (um erro de escrita deixava a rota só para o admin)", () => {
    const usadas = rotas.filter((r) => r.tipo.startsWith("permissao"))
      .flatMap((r) => [...r.args.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]))
      .filter((k) => k.startsWith("manage_") || k.startsWith("confirm_") || k.startsWith("view_"));
    expect(usadas.length).toBeGreaterThan(0);
    expect(usadas.filter((k) => !PERMISSION_KEYS.includes(k))).toEqual([]);
  });

  it("nenhuma rota do painel (/admin, /contacts) fica aberta", () => {
    const abertas = rotas.filter((r) => r.tipo === "publica" || r.tipo === "segredo");
    expect(abertas.filter((r) => / \/(admin|contacts)\//.test(r.rota))).toEqual([]);
  });

  it("os agendadores e o webhook exigem segredo, e o segredo é conferido no handler", () => {
    const comSegredo = rotas.filter((r) => r.tipo === "segredo").map((r) => r.rota);
    expect(comSegredo.filter((r) => r.startsWith("POST /cron/")).length).toBe(6);
    expect(comSegredo).toContain("POST /webhooks/pagamentos");
    // os avisos do KanGest: assinatura HMAC com o segredo da ligação (docs/KANGEST.md)
    expect(comSegredo).toContain("POST /webhooks/kangest");
    // o KanGest Livraria: o código de emparelhamento de uso único e a assinatura Ed25519 de cada pedido
    // (docs/KANGEST-SINCRONIZACAO.md)
    expect(comSegredo).toContain("POST /kangest/emparelhar");
    expect(comSegredo).toContain("POST /kangest/sinc");
    expect(rotas.filter((r) => r.rota.startsWith("POST /cron/") && r.tipo !== "segredo")).toEqual([]);
  });

  // A lista das rotas abertas a qualquer pessoa. Abrir uma rota nova obriga a mudá-la aqui:
  // é a decisão que tem de aparecer na revisão, com o porquê no registo da rota.
  it("as rotas abertas são estas e só estas", () => {
    const publicas = rotas.filter((r) => r.tipo === "publica").map((r) => r.rota).sort();
    expect(publicas).toEqual([
      "GET /api/v1",
      "GET /api/v1/system/info",
      "GET /book-collections",
      "GET /chat/config",
      "GET /geo/localities",
      "GET /geo/municipalities",
      "GET /geo/provinces",
      "GET /health",
      "GET /integrations",
      "GET /messaging/status",
      "GET /payment-methods",
      "GET /push/config",
      "GET /settings",
      "GET /stores",
      "GET /unsubscribe",
      "POST /catalog/view",
      "POST /chat",
      "POST /chat/feedback",
      "POST /chat/new",
      "POST /chat/session",
      "POST /checkout",
      "POST /colportores/candidatura",
      "POST /confirm-delivery",
      "POST /contact-message",
      "POST /newsletter",
      "POST /newsletter/confirm",
      "POST /order-feedback",
      "POST /order/cancel",
      "POST /order/payment-reference",
      "POST /push/native/subscribe",
      "POST /push/native/unsubscribe",
      "POST /push/subscribe",
      "POST /recommendations",
      "POST /telemetria",
      "POST /track",
      "POST /track/destination",
      "POST /track/live",
      "POST /unsubscribe",
      "POST /whatsapp/receipt",
    ]);
  });
});
