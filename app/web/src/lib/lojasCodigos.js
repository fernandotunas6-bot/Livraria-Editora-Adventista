// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O código de cada loja (migração 20261128130000_lojas_novas_sem_colisoes; docs/LOJAS.md): as mesmas regras da base,
// para o painel mostrar já o código que a loja nova vai ter e avisar antes de gravar. Quem decide é a base: um
// código ou um nome repetido é recusado lá, mesmo que o painel não o veja.

const ACENTOS = { Á: 'A', À: 'A', Â: 'A', Ã: 'A', Ä: 'A', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Í: 'I', Ì: 'I', Î: 'I', Ï: 'I', Ó: 'O', Ò: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ú: 'U', Ù: 'U', Û: 'U', Ü: 'U', Ç: 'C', Ñ: 'N' };

/** O texto em maiúsculas, sem acentos nem espaços (só A–Z e 0–9), como `private.so_letras`. */
export const soLetras = (t) => String(t || '').toUpperCase().replace(/[ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]/g, (c) => ACENTOS[c]).replace(/[^A-Z0-9]/g, '');

/** Um código bem escrito: 2 a 6 letras ou algarismos, a começar por uma letra. */
export const codigoValido = (c) => /^[A-Z][A-Z0-9]{1,5}$/.test(c);

/**
 * O código que a loja nova vai ter: as 3 primeiras letras da província (ou do nome); se já houver, com 2, 3… a seguir
 * («Huambo» → HUA, depois HUA2). `usados`: os códigos das outras lojas.
 */
export function codigoSugerido(texto, usados = []) {
  let base = soLetras(texto).replace(/^[0-9]+/, '').slice(0, 3);
  if (base.length < 2) base = 'LJ';
  const ocupados = new Set(usados.filter(Boolean));
  let v = base;
  for (let n = 2; ocupados.has(v); n += 1) v = `${base}${n}`;
  return v;
}

/** Outra loja com o mesmo nome (sem contar maiúsculas, acentos, espaços e sinais), ou `null`. */
export function lojaComOMesmoNome(lojas, nome, excepto = null) {
  const alvo = soLetras(nome);
  if (!alvo) return null;
  return (lojas || []).find((l) => l.id !== excepto && soLetras(l.name) === alvo) || null;
}
