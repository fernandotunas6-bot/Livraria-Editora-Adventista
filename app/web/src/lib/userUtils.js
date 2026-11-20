// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { avatarSrc } from '@/lib/avatar';

export function getUserDisplayName(user) {
  if (!user) return 'Visitante';
  if (user.name?.trim()) return user.name.trim();
  return user.email?.split('@')[0] || 'Utilizador';
}

export function getUserFirstName(user) {
  const name = getUserDisplayName(user);
  return name.split(' ')[0];
}

export function getUserInitials(user) {
  if (!user) return '?';
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  const email = user.email || '';
  return email.slice(0, 2).toUpperCase() || '?';
}

export function getUserAvatarUrl(user) {
  // Ficheiro do bucket ou foto da conta Google (ver lib/avatar.js).
  return avatarSrc(user?.id, user?.avatar) || null;
}
