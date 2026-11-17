import { describe, expect, it } from "vitest";
import { appLink } from "./appLinks.ts";

describe("appLink", () => {
  it("deixa passar as ligações https das lojas e do APK", () => {
    for (const boa of [
      "https://play.google.com/store/apps/details?id=ao.livrariaadventista.app",
      "https://apps.apple.com/ao/app/livraria-adventista/id1234567890",
      "https://testflight.apple.com/join/AbCd1234",
      "https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista/releases/latest/download/livraria-adventista.apk",
    ]) {
      expect(appLink(`  ${boa} `)).toBe(boa);
    }
  });

  it("o resto não chega ao site", () => {
    for (const ma of ["", null, undefined, 42, "livraria.apk", "http://exemplo.ao/app.apk", "javascript:alert(1)",
      "data:text/html,x", "https://a b.ao/x", "https://utilizador:senha@exemplo.ao/app.apk", `https://exemplo.ao/${"a".repeat(500)}`]) {
      expect(appLink(ma), String(ma)).toBe("");
    }
  });
});
