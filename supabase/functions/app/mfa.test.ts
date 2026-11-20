import { describe, expect, it } from "vitest";
import { deadlineFrom, jwtClaims, mfaPending } from "./mfa.ts";

const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64url({ alg: "HS256" })}.${b64url(claims)}.assinatura`;

describe("jwtClaims", () => {
  it("lê o aal e o resto das reivindicações", () => {
    expect(jwtClaims(token({ aal: "aal2", sub: "u1", nome: "José Ângelo" }))).toMatchObject({ aal: "aal2", sub: "u1", nome: "José Ângelo" });
  });
  it("não lança com lixo", () => {
    for (const t of ["", "abc", "a.b.c", "a.%%%.c", undefined as unknown as string]) expect(jwtClaims(t)).toEqual({});
  });
});

describe("mfaPending", () => {
  const verified = [{ status: "verified" }];
  it("sem factor verificado nunca exige o segundo passo (contas de hoje)", () => {
    expect(mfaPending([], token({ aal: "aal1" }))).toBe(false);
    expect(mfaPending(undefined, token({ aal: "aal1" }))).toBe(false);
    expect(mfaPending([{ status: "unverified" }], token({ aal: "aal1" }))).toBe(false);
  });
  it("com factor verificado, só a sessão aal2 passa", () => {
    expect(mfaPending(verified, token({ aal: "aal1" }))).toBe(true);
    expect(mfaPending(verified, token({}))).toBe(true);
    expect(mfaPending(verified, "token-estragado")).toBe(true);
    expect(mfaPending(verified, token({ aal: "aal2" }))).toBe(false);
  });
});

describe("mfaPending — equipa obrigada ao código depois do prazo", () => {
  const agora = Date.parse("2026-11-27T10:00:00Z");
  const antes = agora - 60_000;
  const depois = agora + 60_000;
  it("dentro do prazo, a equipa sem factor continua", () => {
    expect(mfaPending([], token({ aal: "aal1" }), { staff: true, enforceAfter: depois, now: agora })).toBe(false);
  });
  it("passado o prazo, a equipa sem factor fica como cliente", () => {
    expect(mfaPending([], token({ aal: "aal1" }), { staff: true, enforceAfter: antes, now: agora })).toBe(true);
    expect(mfaPending([{ status: "unverified" }], token({ aal: "aal1" }), { staff: true, enforceAfter: antes, now: agora })).toBe(true);
  });
  it("clientes nunca são obrigados", () => {
    expect(mfaPending([], token({ aal: "aal1" }), { staff: false, enforceAfter: antes, now: agora })).toBe(false);
  });
  it("sem prazo (migração por aplicar), nada muda", () => {
    expect(mfaPending([], token({ aal: "aal1" }), { staff: true, enforceAfter: null, now: agora })).toBe(false);
  });
  it("com factor, a regra de sempre: só aal2 passa", () => {
    expect(mfaPending([{ status: "verified" }], token({ aal: "aal2" }), { staff: true, enforceAfter: antes, now: agora })).toBe(false);
    expect(mfaPending([{ status: "verified" }], token({ aal: "aal1" }), { staff: true, enforceAfter: depois, now: agora })).toBe(true);
  });
});

describe("deadlineFrom", () => {
  it("lê a data da base de dados", () => {
    expect(deadlineFrom("2026-11-27T10:00:00+00:00")).toBe(Date.parse("2026-11-27T10:00:00Z"));
  });
  it("infinity e vazio = sem prazo; -infinity = já", () => {
    expect(deadlineFrom("infinity")).toBeNull();
    expect(deadlineFrom(null)).toBeNull();
    expect(deadlineFrom("")).toBeNull();
    expect(deadlineFrom("lixo")).toBeNull();
    expect(deadlineFrom("-infinity")).toBe(0);
  });
});
