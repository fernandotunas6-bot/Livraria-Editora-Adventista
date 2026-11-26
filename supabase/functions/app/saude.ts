// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * A saúde do ecossistema (KANGEST ONE, fase E; GET /api/v1/system/health). Código puro, testado em saude.test.ts: o
 * estado de cada peça, o pior de todos, e o `redact()` que tira dos registos o que nunca lá deve ficar.
 */

export type Estado = "ok" | "aviso" | "grave";

/** O pior estado de uma lista (vazia = ok). */
export const pior = (...estados: Estado[]): Estado => (estados.includes("grave") ? "grave" : estados.includes("aviso") ? "aviso" : "ok");

/**
 * Tira de um texto de registo os segredos e os dados pessoais: tokens (JWT, Bearer), chaves (sb_secret_, sk-…,
 * service_role), emails e números de telefone. Os registos da saúde passam sempre por aqui.
 */
export function redact(texto: string): string {
  return String(texto ?? "")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]")
    .replace(/Bearer\s+\S+/gi, "Bearer [token]")
    .replace(/\b(sb_secret_|sb_publishable_|sk-|service_role)[\w-]*/gi, "[chave]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d ]{7,}\d/g, "[número]");
}

/** Um posto do KanGest: sem contacto há mais de 30 minutos é aviso, há mais de um dia é grave; muitos por enviar, aviso. */
export function estadoDoPosto(
  p: { ultima_sinc?: string | null; estado_computador?: { por_enviar?: number } | null },
  agora: number,
): { estado: Estado; motivo: string } {
  if (!p.ultima_sinc) return { estado: "aviso", motivo: "ainda não sincronizou" };
  const minutos = (agora - Date.parse(p.ultima_sinc)) / 60_000;
  if (!Number.isFinite(minutos)) return { estado: "aviso", motivo: "a hora da última sincronização não se lê" };
  if (minutos > 24 * 60) return { estado: "grave", motivo: "sem contacto há mais de um dia" };
  if (minutos > 30) return { estado: "aviso", motivo: "sem contacto há mais de 30 minutos" };
  const fila = Number(p.estado_computador?.por_enviar ?? 0);
  if (fila > 20) return { estado: "aviso", motivo: `${fila} documentos por enviar` };
  return { estado: "ok", motivo: "" };
}

/** A fila de emails: falhados ou o agendador parado são aviso; mais de 200 por enviar, grave. */
export function estadoDosEmails(pendentes: number, falhados: number, agendadorActivo: boolean | null): { estado: Estado; motivo: string } {
  if (pendentes > 200) return { estado: "grave", motivo: `${pendentes} emails por enviar` };
  if (agendadorActivo === false && pendentes > 0) return { estado: "aviso", motivo: "o agendador da fila não está a correr" };
  if (falhados > 0) return { estado: "aviso", motivo: `${falhados} email(s) falhado(s)` };
  return { estado: "ok", motivo: "" };
}

/** Compara versões «1.4.8» (e «1.4.8 Livraria»): negativo se a < b. */
export function compararVersoes(a: string, b: string): number {
  const partes = (v: string) => (String(v).match(/\d+(\.\d+)*/)?.[0] ?? "0").split(".").map(Number);
  const x = partes(a);
  const y = partes(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
