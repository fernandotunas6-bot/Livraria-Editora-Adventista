// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// A API v1 (KANGEST ONE, fase C): o contrato (docs/api/openapi.json) e o código (index.ts) dizem o mesmo. Cada rota
// /api/v1 está no contrato e vice-versa, com o mesmo acesso; as que reutilizam uma rota antiga têm o acesso dela; as
// escritas levam Idempotency-Key; e a porta recusa quem deve (sem sessão, sem permissão) e deixa passar quem deve.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Access, equipa, permissao, publica, recusa, segredo, sessao } from "./access.ts";
import type { Auth } from "./permissions.ts";

const aqui = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(join(aqui, "index.ts"), "utf8");
const contrato = JSON.parse(readFileSync(join(aqui, "../../../docs/api/openapi.json"), "utf8"));

type Declarado = { tipo: string; chaves: string[] };
const chavesDe = (args: string, tipo: string) => {
  const textos = [...args.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (tipo === "permissaoCom") textos.shift();
  return tipo.startsWith("permissao") ? textos.sort() : [];
};
const ACESSO = /route\("(GET|POST)", "([^"]+)", (publica|segredo|sessao|equipa|permissao|permissaoCom)\(((?:[^()"]|"[^"]*")*)\)/g;
const todas = new Map<string, Declarado>();
for (const m of codigo.matchAll(ACESSO)) {
  todas.set(`${m[1]} ${m[2]}`, { tipo: m[3] === "permissaoCom" ? "permissao" : m[3], chaves: chavesDe(m[4], m[3]) });
}
// as rotas v1 que reutilizam uma antiga: o acesso é o dela
const reutilizadas = new Map<string, string>();
for (const m of codigo.matchAll(/rotaV1\("(GET|POST)", "([^"]+)", "((?:GET|POST) [^"]+)"\)/g)) {
  const antiga = todas.get(m[3]);
  if (!antiga) throw new Error(`rotaV1 aponta para uma rota que não existe: ${m[3]}`);
  todas.set(`${m[1]} ${m[2]}`, antiga);
  reutilizadas.set(`${m[1]} ${m[2]}`, m[3]);
}
const doCodigo = [...todas.entries()].filter(([k]) => / \/api\/v1(\/|$)/.test(k));
const doContrato: [string, Record<string, any>][] = [];
for (const [caminho, ops] of Object.entries(contrato.paths as Record<string, Record<string, any>>)) {
  for (const [metodo, op] of Object.entries(ops)) doContrato.push([`${metodo.toUpperCase()} ${caminho}`, op]);
}

const acesso = (d: Declarado): Access =>
  d.tipo === "publica" ? publica("teste") : d.tipo === "segredo" ? segredo("teste") : d.tipo === "sessao" ? sessao() : d.tipo === "equipa" ? equipa() : permissao(...d.chaves);
const visitante: Auth = null;
const cliente: Auth = { id: "3", email: "c@b.ao", role: "member", permissions: { manage_users: true, manage_settings: true } };
const gestorSem: Auth = { id: "2", email: "g@b.ao", role: "manager", permissions: {} };
const admin: Auth = { id: "1", email: "a@b.ao", role: "admin", permissions: {} };

describe("API v1: o contrato e o código", () => {
  it("há rotas v1, e são as mesmas nos dois lados", () => {
    expect(doCodigo.length).toBeGreaterThanOrEqual(10);
    expect(doCodigo.map(([k]) => k).sort()).toEqual(doContrato.map(([k]) => k).sort());
  });

  it("cada rota tem no contrato o acesso que tem no código", () => {
    for (const [k, d] of doCodigo) {
      const op = doContrato.find(([c]) => c === k)![1];
      expect({ rota: k, tipo: op["x-acesso"]?.tipo, chaves: (op["x-acesso"]?.chaves ?? []).slice().sort() }).toEqual({ rota: k, tipo: d.tipo, chaves: d.chaves });
    }
  });

  it("as que reutilizam uma rota antiga dizem qual, e têm o acesso dela", () => {
    for (const [k, op] of doContrato) {
      expect({ rota: k, reutiliza: op["x-reutiliza"] ?? null }).toEqual({ rota: k, reutiliza: reutilizadas.get(k) ?? null });
    }
  });

  it("nenhuma rota v1 é segredo nem fica aberta sem dizer porquê no código", () => {
    for (const [k, d] of doCodigo) expect({ rota: k, tipo: d.tipo }).not.toEqual({ rota: k, tipo: "segredo" });
  });

  it("as escritas levam Idempotency-Key (no contrato e no código)", () => {
    for (const [k, op] of doContrato.filter(([c]) => c.startsWith("POST "))) {
      const refs = (op.parameters ?? []).map((p: { $ref?: string }) => p.$ref);
      expect({ rota: k, idempotente: refs.includes("#/components/parameters/IdempotencyKey") }).toEqual({ rota: k, idempotente: true });
      if (!reutilizadas.has(k)) {
        const caminho = k.slice(5);
        const i = codigo.indexOf(`route("POST", "${caminho}"`);
        const fim = codigo.indexOf("\nroute(", i + 1);
        expect({ rota: k, usa: codigo.slice(i, fim).includes("idempotenteV1(") }).toEqual({ rota: k, usa: true });
      }
    }
  });

  it("as rotas com sessão dizem-no no contrato (security) e documentam a recusa", () => {
    for (const [k, op] of doContrato) {
      const tipo = op["x-acesso"].tipo;
      const comSessao = tipo !== "publica";
      expect({ rota: k, security: (op.security ?? []).length > 0 }).toEqual({ rota: k, security: comSessao });
      if (comSessao) expect({ rota: k, r401: !!op.responses["401"] }).toEqual({ rota: k, r401: true });
      if (tipo === "permissao" || tipo === "equipa") expect({ rota: k, r403: !!op.responses["403"] }).toEqual({ rota: k, r403: true });
    }
  });
});

describe("API v1: a porta de cada rota (sem sessão, sem permissão, com permissão)", () => {
  it("recusa e deixa passar como o contrato diz", () => {
    for (const [k, d] of doCodigo) {
      const a = acesso(d);
      if (d.tipo === "publica") {
        expect({ rota: k, r: recusa(a, visitante) }).toEqual({ rota: k, r: null });
        continue;
      }
      // sem sessão
      expect({ rota: k, status: recusa(a, visitante)?.status }).toEqual({ rota: k, status: d.tipo === "sessao" ? 401 : 403 });
      if (d.tipo === "permissao") {
        // um cliente nunca passa, nem com a permissão escrita no perfil; um gestor sem ela também não
        expect({ rota: k, status: recusa(a, cliente)?.status }).toEqual({ rota: k, status: 403 });
        expect({ rota: k, status: recusa(a, gestorSem)?.status }).toEqual({ rota: k, status: 403 });
        // com ela, passa; o administrador tem todas
        const gestorCom: Auth = { id: "4", email: "p@b.ao", role: "manager", permissions: { [d.chaves[0]]: true } };
        expect({ rota: k, r: recusa(a, gestorCom) }).toEqual({ rota: k, r: null });
      } else if (d.tipo === "equipa") {
        // só a equipa: um cliente não passa; um gestor passa mesmo sem permissões (o RLS e as funções decidem o resto)
        expect({ rota: k, status: recusa(a, cliente)?.status }).toEqual({ rota: k, status: 403 });
        expect({ rota: k, r: recusa(a, gestorSem) }).toEqual({ rota: k, r: null });
      } else {
        expect({ rota: k, r: recusa(a, cliente) }).toEqual({ rota: k, r: null });
      }
      expect({ rota: k, r: recusa(a, admin) }).toEqual({ rota: k, r: null });
    }
  });
});
