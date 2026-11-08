import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Os contextos que a Edge Function grava em `notification_logs` têm de caber na regra
// `notification_logs_context_check` da base. Seis não cabiam (migração
// 20261107140000_contextos_do_registo_de_envios): os envios ficavam sem registo e a protecção
// contra emails repetidos, que lê esse registo, deixava de funcionar para eles.

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, "..", "..", "migrations");

function codeContexts() {
  const found = new Set<string>();
  for (const file of readdirSync(here)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const src = readFileSync(join(here, file), "utf8");
    for (const m of src.matchAll(/context:\s*"([a-z_]+)"/g)) found.add(m[1]);
    // `context: x ? "a" : "b"` (contactos e campanhas).
    for (const m of src.matchAll(/context:\s*[^,\n]*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)) {
      found.add(m[1]);
      found.add(m[2]);
    }
  }
  return [...found].sort();
}

/** A regra em vigor: a última migração que a (re)define. */
function allowedContexts() {
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
  let last = "";
  for (const file of files) {
    const sql = readFileSync(join(migrations, file), "utf8");
    const at = sql.lastIndexOf("add constraint notification_logs_context_check");
    if (at >= 0) last = sql.slice(at, sql.indexOf(";", at));
  }
  return [...last.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("contextos do registo de envios", () => {
  it("encontra os contextos no código e na regra (o teste não está a ler o vazio)", () => {
    expect(codeContexts()).toEqual(expect.arrayContaining(["order", "account", "staff_alert", "thanks"]));
    expect(allowedContexts().length).toBeGreaterThan(5);
  });

  it("todos os contextos usados no código são aceites pela base", () => {
    const allowed = new Set(allowedContexts());
    expect(codeContexts().filter((c) => !allowed.has(c))).toEqual([]);
  });
});
