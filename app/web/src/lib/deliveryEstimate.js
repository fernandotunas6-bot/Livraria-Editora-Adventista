// Quando chega: a data estimada de entrega, a partir dos prazos publicados em "Envios e
// devoluções" (/shipping-returns). Como nas lojas grandes, "chega entre 14 e 18 nov." diz mais
// do que "5 a 7 dias úteis", que obriga a pessoa a fazer a conta (e a saltar os fins de semana).
//
// Dias úteis de segunda a sexta. Os feriados não contam: por isso a página diz "estimada".

export const DELIVERY_DAYS = Object.freeze({
  luanda: [5, 7],
  provincias: [7, 14],
  expressa: [1, 2],
});

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** A data `days` dias úteis depois de `date` (o próprio dia não conta). */
export function addBusinessDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return d;
}

/** Janela de entrega para `kind` ('luanda' | 'provincias' | 'expressa'), a contar de `now`. */
export function deliveryWindow(kind = 'luanda', now = new Date()) {
  const [min, max] = DELIVERY_DAYS[kind] || DELIVERY_DAYS.luanda;
  return { from: addBusinessDays(now, min), to: addBusinessDays(now, max) };
}

/** "14–18 nov." ou, a passar de mês, "28 nov. – 4 dez.". */
export function formatWindow({ from, to }) {
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return from.getDate() === to.getDate()
      ? `${to.getDate()} ${MESES[to.getMonth()]}`
      : `${from.getDate()}–${to.getDate()} ${MESES[to.getMonth()]}`;
  }
  return `${from.getDate()} ${MESES[from.getMonth()]} – ${to.getDate()} ${MESES[to.getMonth()]}`;
}
