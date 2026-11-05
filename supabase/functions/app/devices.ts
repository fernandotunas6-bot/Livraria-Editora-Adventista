/**
 * Reconhecer o aparelho de onde se entrou na conta, para o aviso de novo acesso.
 *
 * Fica pelo navegador e pelo sistema ("Chrome em Android"), e não pela versão nem pelo IP.
 * A versão muda a cada actualização do navegador e o IP muda sempre que o telemóvel troca
 * de rede: com qualquer um deles, o mesmo telemóvel de sempre geraria um "novo acesso" por
 * semana, e o cliente aprendia a ignorar o aviso no dia em que ele importasse.
 */

const BROWSERS: [RegExp, string][] = [
  [/edg(e|a|ios)?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/samsungbrowser\//i, "Samsung Internet"],
  [/firefox\/|fxios\//i, "Firefox"],
  [/chrome\/|crios\//i, "Chrome"],
  [/safari\//i, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/android/i, "Android"],
  [/iphone|ipad|ipod/i, "iOS"],
  [/windows/i, "Windows"],
  [/mac os x|macintosh/i, "macOS"],
  [/cros/i, "ChromeOS"],
  [/linux/i, "Linux"],
];

const pick = (ua: string, table: [RegExp, string][]) => table.find(([re]) => re.test(ua))?.[1] || "";

/** "Chrome em Android", ou "Navegador desconhecido" quando não há nada que se reconheça. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = String(userAgent || "").slice(0, 512);
  const browser = pick(ua, BROWSERS);
  const system = pick(ua, SYSTEMS);
  if (browser && system) return `${browser} em ${system}`;
  return browser || system || "Navegador desconhecido";
}

/**
 * Chave do aparelho, guardada por conta. Um hash, para a base de dados não guardar a
 * descrição em claro ao lado do id da conta, e de tamanho fixo.
 */
export async function deviceKey(userId: string, userAgent: string | null | undefined): Promise<string> {
  const data = new TextEncoder().encode(`${userId}|${describeDevice(userAgent)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
