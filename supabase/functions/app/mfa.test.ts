import { describe, expect, it } from "vitest";
import { jwtClaims, mfaPending } from "./mfa.ts";

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
