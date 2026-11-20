// @vitest-environment node
import { describe, expect, it } from "vitest";
import { coarse, maskPhone, maskText, trackDestination, trackPersonalFields } from "./trackPrivacy.ts";

const ENCOMENDA = {
  customer_name: "Maria dos Santos", phone: "+244 923 456 789",
  delivery_relative_name: "João Manuel", delivery_relative_phone: "912345678",
  delivery_street: "Rua Amílcar Cabral, 45, 2.º andar", delivery_reference: "Junto à farmácia central",
  delivery_province: "Luanda", delivery_municipality: "Talatona", delivery_locality: "Camama",
};

describe("máscaras", () => {
  it("telefone: só os últimos três algarismos", () => {
    expect(maskPhone("+244 923 456 789")).toBe("••• ••• 789");
    expect(maskPhone("")).toBe("");
    expect(maskPhone("123")).toBe("•••");
  });
  it("texto: o início e reticências", () => {
    expect(maskText("Rua Amílcar Cabral, 45")).toBe("Rua…");
    expect(maskText("ab")).toBe("•••");
    expect(maskText("")).toBe("");
  });
  it("coordenada arredondada à zona (~1 km)", () => {
    expect(coarse(-8.912345)).toBe(-8.91);
    expect(coarse("x")).toBeNull();
  });
});

describe("trackPersonalFields", () => {
  it("o dono da encomenda vê tudo", () => {
    expect(trackPersonalFields(ENCOMENDA, true)).toMatchObject({
      masked: false, phone: "+244 923 456 789", delivery_street: "Rua Amílcar Cabral, 45, 2.º andar",
      delivery_relative_phone: "912345678", customer_name: "Maria dos Santos",
    });
  });
  it("quem só tem o número e o email não vê a morada nem os telefones", () => {
    const f = trackPersonalFields(ENCOMENDA, false);
    expect(f.masked).toBe(true);
    expect(f.phone).toBe("••• ••• 789");
    expect(f.delivery_relative_phone).toBe("••• ••• 678");
    expect(f.delivery_relative_name).toBe("João");
    expect(f.customer_name).toBe("Maria");
    expect(f.delivery_street).toBe("Rua…");
    expect(f.delivery_reference).toBe("•••");
    expect(f.delivery_address_full).toBe("Rua…, Camama, Talatona, Luanda");
    expect(JSON.stringify(f)).not.toMatch(/Amílcar|farmácia|456/);
  });
});

describe("trackDestination", () => {
  const ponto = { lat: -8.912345, lng: 13.187654, accuracy: 12, updated_at: null };
  it("exacto para o dono", () => {
    expect(trackDestination(ponto, true)).toEqual(ponto);
  });
  it("à zona para os outros", () => {
    expect(trackDestination(ponto, false)).toMatchObject({ lat: -8.91, lng: 13.19, accuracy: 1000 });
  });
  it("sem ponto, nada", () => {
    expect(trackDestination(null, false)).toBeNull();
  });
});
