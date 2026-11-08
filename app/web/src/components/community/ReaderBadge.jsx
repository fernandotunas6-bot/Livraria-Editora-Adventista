import React from 'react';
import { Award, BookOpen, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { levelInfo } from '@/lib/readerLevels';

const STYLE = {
  leitor: { icon: BookOpen, className: 'bg-editorial-tela text-editorial-petroleo' },
  assiduo: { icon: Award, className: 'bg-sky-500/10 text-sky-800 dark:text-sky-300' },
  honra: { icon: Crown, className: 'bg-amber-500/15 text-amber-900 dark:text-amber-300' },
};

/**
 * O distintivo do nível de leitor: Leitor, Leitor assíduo, Leitor de honra. As contas novas não
 * têm distintivo (`level` 'novo', nulo ou ainda por saber: não mostra nada).
 */
export default function ReaderBadge({ level, className, size = 'sm' }) {
  const style = STYLE[level];
  if (!style) return null;
  const Icon = style.icon;
  const info = levelInfo(level);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
        size === 'sm' ? 'text-[11px]' : 'text-xs',
        style.className,
        className,
      )}
      title={info.description}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" /> {info.label}
    </span>
  );
}
