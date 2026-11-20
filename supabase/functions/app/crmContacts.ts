// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Regras de escrita no CRM (tabela `contacts`) a partir de rotas públicas.
//
// O formulário de contacto e o checkout escrevem no CRM sem sessão, e o contacto encontra-se pelo
// email. Antes, um contacto que já existia ficava com o nome, o telefone e as notas de quem
// enviasse o formulário com aquele email: as notas da equipa apagavam-se, e as campanhas e os
// avisos por WhatsApp seguiam para o número que o visitante tivesse escrito. Numa rota pública,
// um contacto existente só ganha o que lhe falta; as notas acrescentam-se, com data.

type Row = Record<string, any>;

/** Tamanho máximo das notas de um contacto: as mais antigas saem primeiro. */
export const MAX_CONTACT_NOTES = 8000;

const filled = (value: unknown) => typeof value === "string" ? value.trim() !== "" : value != null;

/** Junta uma nota nova às que já existem, com a data (AAAA-MM-DD), sem passar do máximo. */
export function appendContactNote(existing: unknown, note: string, now: Date = new Date()) {
  const line = `${now.toISOString().slice(0, 10)} · ${note.trim()}`;
  const before = typeof existing === "string" ? existing.trim() : "";
  if (!before) return line.slice(0, MAX_CONTACT_NOTES);
  if (before.endsWith(line)) return before; // o mesmo pedido repetido não duplica a nota
  const joined = `${before}\n\n${line}`;
  return joined.length > MAX_CONTACT_NOTES ? joined.slice(joined.length - MAX_CONTACT_NOTES) : joined;
}

/**
 * Os campos a gravar num contacto **existente** quando quem escreve não é da equipa (formulário
 * de contacto, checkout). Nome e telefone só se faltarem; notas acrescentadas; metadados juntos.
 * Os restantes campos (etiquetas, comprador, sincronização) tratam-se em `upsertContact`.
 */
export function publicContactFields(existing: Row, item: Row, now: Date = new Date()): Row {
  const out: Row = {};
  const placeholderName = !filled(existing.name) || existing.name === "Sem Nome";
  if (filled(item.name) && placeholderName) out.name = item.name;
  if (filled(item.phone) && !filled(existing.phone)) out.phone = item.phone;
  if (filled(item.notes)) out.notes = appendContactNote(existing.notes, String(item.notes), now);
  if (item.metadata && typeof item.metadata === "object") {
    const before = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
    out.metadata = { ...before, ...item.metadata };
  }
  return out;
}
