import { mediaUrl } from '@/lib/supabaseClient';

// O perfil guarda ou o nome de um ficheiro do bucket `media` (users/<id>/<ficheiro>) ou, para
// quem entrou com a Google, o endereço completo da foto da Google (`avatar_url` dos metadados,
// copiado na criação do perfil). O menu da conta, o perfil e as avaliações juntavam sempre o
// caminho do bucket e a foto da Google ficava partida:
// `/media/users/<id>/https:%2F%2Flh3.googleusercontent.com%2F…` → 400 (registos de 2026-11-07).
//
// Endereços completos só da Google: o perfil é editável pelo próprio, e uma foto num servidor
// qualquer apareceria a toda a gente nas avaliações — e esse servidor ficava a saber quem as lê.
const GOOGLE_PHOTO = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//i;
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/** Endereço da foto de perfil, ou '' quando não há (o componente mostra as iniciais). */
export function avatarSrc(userId, avatar) {
  const value = String(avatar || '').trim();
  if (!value) return '';
  if (ABSOLUTE.test(value)) return GOOGLE_PHOTO.test(value) ? value : '';
  return userId ? mediaUrl('users', userId, value) : '';
}
