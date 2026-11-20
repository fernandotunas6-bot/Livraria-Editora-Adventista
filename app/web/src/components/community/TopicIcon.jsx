// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import {
  BookOpen, CalendarDays, Church, Globe, GraduationCap, HandHeart, HeartPulse, Music, ScrollText, Sparkles, Sunrise, Users,
} from 'lucide-react';
import { topicIcon } from '@/lib/communityStyle';

const ICONS = {
  'book-open': BookOpen,
  'scroll-text': ScrollText,
  'calendar-days': CalendarDays,
  users: Users,
  'heart-pulse': HeartPulse,
  sunrise: Sunrise,
  sparkles: Sparkles,
  'hand-heart': HandHeart,
  music: Music,
  globe: Globe,
  'graduation-cap': GraduationCap,
  church: Church,
};

/** Ícone de um tema da comunidade (só os da lista; outro nome dá o livro aberto). */
export default function TopicIcon({ name, className = 'h-4 w-4' }) {
  const Icon = ICONS[topicIcon(name)] || BookOpen;
  return <Icon className={className} aria-hidden="true" />;
}
