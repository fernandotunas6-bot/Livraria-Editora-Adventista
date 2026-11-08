/**
 * Junta uma leitura nova à anterior sem trocar o que não mudou: as partes iguais ficam com o
 * objecto antigo. Os ecrãs que voltam a ler em silêncio (um sinal em tempo real, a consulta de
 * tempos a tempos) usam-no para que um formulário aberto, que depende de uma dessas partes, não
 * se apague nem volte ao princípio por uma leitura igual. Sem mudanças, devolve o próprio objecto
 * antigo — e o React não volta a pintar.
 */
export function keepUnchanged(prev, next) {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object' || Array.isArray(next)) return next;
  let same = Object.keys(prev).length === Object.keys(next).length;
  const out = {};
  for (const key of Object.keys(next)) {
    const equal = key in prev && JSON.stringify(prev[key]) === JSON.stringify(next[key]);
    out[key] = equal ? prev[key] : next[key];
    if (!equal) same = false;
  }
  return same ? prev : out;
}
