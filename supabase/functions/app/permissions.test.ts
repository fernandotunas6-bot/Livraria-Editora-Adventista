import { describe, expect, it } from "vitest";
import { type Auth, PERMISSION_KEYS, can, canCrm, isStaff } from "./permissions.ts";

const admin: Auth = { id: "1", email: "a@b.ao", role: "admin", permissions: {} };
const gestor = (permissions: Record<string, unknown>): Auth =>
  ({ id: "2", email: "g@b.ao", role: "manager", permissions });
const cliente: Auth = { id: "3", email: "c@b.ao", role: "member", permissions: { manage_users: true } };

describe("isStaff", () => {
  it("é a equipa, não uma permissão", () => {
    expect(isStaff(admin)).toBe(true);
    expect(isStaff(gestor({}))).toBe(true);
    expect(isStaff(cliente)).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

describe("can", () => {
  it("o admin pode tudo, mesmo sem nada marcado", () => {
    for (const chave of PERMISSION_KEYS) expect(can(admin, chave)).toBe(true);
  });

  it("o gestor só pode o que tem activo", () => {
    const g = gestor({ manage_orders: true });
    expect(can(g, "manage_orders")).toBe(true);
    expect(can(g, "manage_users")).toBe(false);
    expect(can(g, "manage_settings")).toBe(false);
  });

  it("um cliente não pode, nem com a permissão escrita no perfil", () => {
    // O papel manda. Sem isto, bastava escrever no `profiles.permissions` de um cliente.
    expect(can(cliente, "manage_users")).toBe(false);
  });

  it("sem sessão não pode nada", () => {
    expect(can(null, "manage_orders")).toBe(false);
    expect(canCrm(null)).toBe(false);
    expect(isStaff(null)).toBe(false);
  });

  it("só `true` conta — o resto do JSON não passa por engano", () => {
    // Os valores vêm de JSON guardado na base: uma string "false" é verdadeira em JavaScript,
    // e um `1` também. É por isso que a comparação é `=== true` e não um teste de verdade.
    for (const valor of ["true", "false", 1, 0, "", null, undefined, {}, []]) {
      expect(can(gestor({ manage_orders: valor }), "manage_orders")).toBe(false);
    }
    expect(can(gestor({ manage_orders: true }), "manage_orders")).toBe(true);
  });

  it("uma chave que não existe não abre nada", () => {
    expect(can(gestor({ inventada: true }), "inventada")).toBe(true);
    expect(can(gestor({ manage_orders: true }), "manage_catalog")).toBe(false);
  });
});

describe("canCrm", () => {
  it("chega ter um dos dois papéis", () => {
    expect(canCrm(gestor({ manage_users: true }))).toBe(true);
    expect(canCrm(gestor({ manage_marketing: true }))).toBe(true);
    expect(canCrm(admin)).toBe(true);
  });

  it("não chega ter outra permissão qualquer", () => {
    expect(canCrm(gestor({ manage_orders: true, manage_catalog: true }))).toBe(false);
    expect(canCrm(gestor({}))).toBe(false);
  });
});
