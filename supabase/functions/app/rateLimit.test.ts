// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from "vitest";
import { createLocalRateLimit, createRateLimit, funcaoEmFalta } from "./rateLimit.ts";

/** Relógio que só anda quando lhe dizem — para a janela de um minuto não levar um minuto. */
function relogio(inicio = 1_000_000) {
  let agora = inicio;
  return { now: () => agora, avancar: (ms: number) => { agora += ms; } };
}

describe("createLocalRateLimit", () => {
  it("deixa passar até ao limite e trava o seguinte", () => {
    const permite = createLocalRateLimit(relogio().now);
    expect(permite("checkout", "1.1.1.1", 3)).toBe(true);
    expect(permite("checkout", "1.1.1.1", 3)).toBe(true);
    expect(permite("checkout", "1.1.1.1", 3)).toBe(true);
    expect(permite("checkout", "1.1.1.1", 3)).toBe(false);
  });

  it("a janela é de um minuto e desliza", () => {
    const r = relogio();
    const permite = createLocalRateLimit(r.now);
    expect(permite("checkout", "1.1.1.1", 1)).toBe(true);
    expect(permite("checkout", "1.1.1.1", 1)).toBe(false);
    r.avancar(59_999);
    expect(permite("checkout", "1.1.1.1", 1)).toBe(false);
    r.avancar(2);
    expect(permite("checkout", "1.1.1.1", 1)).toBe(true);
  });

  it("conta cada cliente e cada balcão por si", () => {
    const permite = createLocalRateLimit(relogio().now);
    expect(permite("checkout", "1.1.1.1", 1)).toBe(true);
    expect(permite("checkout", "2.2.2.2", 1)).toBe(true);
    expect(permite("track", "1.1.1.1", 1)).toBe(true);
    expect(permite("checkout", "1.1.1.1", 1)).toBe(false);
  });

  it("sem cliente, todos partilham o mesmo balde", () => {
    // Melhor do que dar passe livre a quem não traz endereço.
    const permite = createLocalRateLimit(relogio().now);
    expect(permite("contact", "", 1)).toBe(true);
    expect(permite("contact", "", 1)).toBe(false);
  });
});

describe("funcaoEmFalta", () => {
  it("distingue não existir de ter falhado", () => {
    expect(funcaoEmFalta({ code: "PGRST202" })).toBe(true);
    expect(funcaoEmFalta({ message: "Could not find the function public.check_rate_limit" })).toBe(true);
    expect(funcaoEmFalta({ message: "function check_rate_limit does not exist" })).toBe(true);
    expect(funcaoEmFalta({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(funcaoEmFalta(null)).toBe(false);
  });
});

describe("createRateLimit", () => {
  it("quando a base responde, é ela que manda", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const permite = createRateLimit({ rpc });
    expect(await permite("checkout", "1.1.1.1", 5)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_bucket: "checkout", p_client: "1.1.1.1", p_max: 5,
    });
  });

  it("só o `false` da base trava — um nulo não fecha a loja", async () => {
    const negado = createRateLimit({ rpc: vi.fn().mockResolvedValue({ data: false, error: null }) });
    expect(await negado("checkout", "1.1.1.1", 5)).toBe(false);
    const nulo = createRateLimit({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) });
    expect(await nulo("checkout", "1.1.1.1", 5)).toBe(true);
  });

  it("função em falta: desiste de vez e não volta a ir à base", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const permite = createRateLimit({ rpc, now: relogio().now });
    expect(await permite("checkout", "1.1.1.1", 2)).toBe(true);
    expect(await permite("checkout", "1.1.1.1", 2)).toBe(true);
    expect(await permite("checkout", "1.1.1.1", 2)).toBe(false);
    // Uma ida à base, não três: é o ponto de desistir de vez.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("falha passageira: recua à memória mas volta a tentar no pedido seguinte", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "57014", message: "timeout" } })
      .mockResolvedValue({ data: true, error: null });
    const permite = createRateLimit({ rpc, now: relogio().now });
    expect(await permite("checkout", "1.1.1.1", 5)).toBe(true);
    expect(await permite("checkout", "1.1.1.1", 5)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("não grita para a consola sem lho pedirem", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(createRateLimit({ rpc })("checkout", "1.1.1.1", 5)).resolves.toBe(true);
  });
});
