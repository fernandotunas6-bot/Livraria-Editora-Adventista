// Horário da equipa no chat: "disponível agora" ou "volta amanhã às 08h", como nos mensageiros
// de atendimento. O horário vem do servidor (Equipas e alertas, /chat/config) e é em hora de
// Luanda — UTC+1, sem hora de Verão —, a mesma conta de supabase/functions/app/opsRouting.ts.
// O "aberto agora" calcula-se aqui, na hora: a resposta do servidor fica em cache.

const LUANDA_OFFSET = 3600_000;
const DAY_NAMES = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const DAY_SHORT = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Horário válido ({ openHour, closeHour, openDays }) ou null — então o chat não diz nada. */
export function normalizeHours(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const openHour = Number(raw.open_hour);
  const closeHour = Number(raw.close_hour);
  const openDays = Array.isArray(raw.open_days)
    ? [...new Set(raw.open_days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
    : [];
  if (!Number.isInteger(openHour) || !Number.isInteger(closeHour) || openHour < 0 || closeHour > 24 || openHour >= closeHour || !openDays.length) {
    return null;
  }
  return { openHour, closeHour, openDays };
}

function luanda(ms) {
  const d = new Date(ms + LUANDA_OFFSET);
  return { day: d.getUTCDay() || 7, hour: d.getUTCHours() };
}

export const fmtHour = (h) => `${String(h).padStart(2, '0')}h`;

function daysText(days) {
  if (days.length === 7) return 'Todos os dias';
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (contiguous && days.length > 2) return `${DAY_SHORT[days[0]]} a ${DAY_SHORT[days[days.length - 1]]}`;
  const names = days.map((d) => DAY_SHORT[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0];
}

/** "Segunda a sábado, das 08h às 18h" (hora de Angola). */
export function hoursSummary(raw) {
  const h = normalizeHours(raw);
  if (!h) return '';
  const days = daysText(h.openDays);
  return `${days.charAt(0).toUpperCase()}${days.slice(1)}, das ${fmtHour(h.openHour)} às ${fmtHour(h.closeHour)}`;
}

/**
 * A equipa está a trabalhar agora? Se não, quando volta.
 * { open: true, label: 'A equipa está disponível', short: 'Disponível agora', detail: 'até às 18h' }
 * { open: false, label: 'A equipa volta amanhã às 08h', short: 'Volta amanhã às 08h',
 *   detail: 'Segunda a sábado, das 08h às 18h' }
 */
export function teamAvailability(raw, now = Date.now()) {
  const h = normalizeHours(raw);
  if (!h) return null;
  const l = luanda(now);
  if (h.openDays.includes(l.day) && l.hour >= h.openHour && l.hour < h.closeHour) {
    return { open: true, label: 'A equipa está disponível', short: 'Disponível agora', detail: `até às ${fmtHour(h.closeHour)}` };
  }
  for (let i = 0; i < 8; i += 1) {
    const day = ((l.day - 1 + i) % 7) + 1;
    if (!h.openDays.includes(day)) continue;
    // Hoje só conta se ainda não abriu (fora de horas, depois do fecho, abre noutro dia).
    if (i === 0 && l.hour >= h.openHour) continue;
    const when = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : `${day >= 6 ? 'no' : 'na'} ${DAY_NAMES[day]}`;
    const back = `${when} às ${fmtHour(h.openHour)}`;
    return { open: false, label: `A equipa volta ${back}`, short: `Volta ${back}`, detail: hoursSummary(raw) };
  }
  return null;
}
