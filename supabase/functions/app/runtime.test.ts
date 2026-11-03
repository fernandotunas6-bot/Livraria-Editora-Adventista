import { describe, expect, it, vi } from "vitest";
import { createMemo, runAfterResponse } from "./runtime.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createMemo", () => {
  it("dentro do prazo devolve a mesma leitura; depois volta a ler", async () => {
    let t = 0;
    const { cached } = createMemo(() => t);
    const load = vi.fn(async () => ({ v: 1 }));
    await cached("k", 1000, load);
    t = 999;
    await cached("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(1);
    t = 1000;
    await cached("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("pedidos simultâneos partilham uma só leitura", async () => {
    const { cached } = createMemo(() => 0);
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { release = r; }));
    const a = cached("k", 1000, load);
    const b = cached("k", 1000, load);
    release("x");
    expect(await a).toBe("x");
    expect(await b).toBe("x");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("`fresh` ignora a cache e passa a guardar a leitura nova", async () => {
    const { cached } = createMemo(() => 0);
    let n = 0;
    const load = async () => ++n;
    expect(await cached("k", 1000, load)).toBe(1);
    expect(await cached("k", 1000, load, true)).toBe(2);
    expect(await cached("k", 1000, load)).toBe(2);
  });

  it("uma falha não fica guardada: quem pede a seguir volta a tentar", async () => {
    const { cached } = createMemo(() => 0);
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("base de dados indisponível"))
      .mockResolvedValueOnce({ ok: true });
    await expect(cached("k", 1000, load)).rejects.toThrow("indisponível");
    await tick();
    expect(await cached("k", 1000, load)).toEqual({ ok: true });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("um resultado vazio não fica guardado", async () => {
    const { cached } = createMemo(() => 0);
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "s1" });
    expect(await cached("k", 1000, load)).toBeNull();
    await tick();
    expect(await cached("k", 1000, load)).toEqual({ id: "s1" });
  });

  it("`forget` obriga a ler de novo (quem grava as definições chama-o)", async () => {
    const { cached, forget } = createMemo(() => 0);
    const load = vi.fn(async () => 1);
    await cached("k", 1000, load);
    forget("k");
    await cached("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("chaves diferentes não se misturam", async () => {
    const { cached } = createMemo(() => 0);
    expect(await cached("a", 1000, async () => "A")).toBe("A");
    expect(await cached("b", 1000, async () => "B")).toBe("B");
  });
});

describe("runAfterResponse", () => {
  it("entrega a tarefa ao EdgeRuntime.waitUntil", async () => {
    const waitUntil = vi.fn();
    const task = vi.fn(async () => "feito");
    await runAfterResponse("t", task, { waitUntil });
    expect(task).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it("sem EdgeRuntime a tarefa corre na mesma", async () => {
    const task = vi.fn(async () => undefined);
    await runAfterResponse("t", task, undefined);
    expect(task).toHaveBeenCalledOnce();
  });

  it("um erro na tarefa fica no registo e não rejeita", async () => {
    const log = vi.fn();
    await expect(runAfterResponse("Post-checkout email", async () => { throw new Error("SMTP"); }, undefined, log))
      .resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Post-checkout email:", expect.any(Error));
  });

  it("uma tarefa que rebenta antes de devolver a promessa também não parte nada", async () => {
    const log = vi.fn();
    const waitUntil = vi.fn();
    const broken = (() => { throw new Error("síncrono"); }) as unknown as () => Promise<unknown>;
    await expect(runAfterResponse("t", broken, { waitUntil }, log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
  });
});
