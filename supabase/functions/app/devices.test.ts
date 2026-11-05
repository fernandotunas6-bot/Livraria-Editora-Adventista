import { describe, expect, it } from "vitest";
import { describeDevice, deviceKey } from "./devices.ts";

const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  chromeAndroidNext: "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
};

describe("describeDevice", () => {
  it("reconhece navegador e sistema", () => {
    expect(describeDevice(UA.chromeAndroid)).toBe("Chrome em Android");
    expect(describeDevice(UA.safariIphone)).toBe("Safari em iOS");
    // O Edge diz "Chrome" e "Safari" no User-Agent: tem de ganhar o Edge.
    expect(describeDevice(UA.edgeWindows)).toBe("Edge em Windows");
    expect(describeDevice(UA.firefoxMac)).toBe("Firefox em macOS");
  });

  it("sem User-Agent, diz que não sabe em vez de inventar", () => {
    expect(describeDevice("")).toBe("Navegador desconhecido");
    expect(describeDevice(undefined)).toBe("Navegador desconhecido");
  });
});

describe("deviceKey", () => {
  it("uma actualização do navegador não conta como aparelho novo", async () => {
    expect(await deviceKey("u1", UA.chromeAndroid)).toBe(await deviceKey("u1", UA.chromeAndroidNext));
  });

  it("muda com o aparelho e com a conta, e tem o formato que a tabela aceita", async () => {
    const a = await deviceKey("u1", UA.chromeAndroid);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await deviceKey("u1", UA.safariIphone));
    expect(a).not.toBe(await deviceKey("u2", UA.chromeAndroid));
  });
});
