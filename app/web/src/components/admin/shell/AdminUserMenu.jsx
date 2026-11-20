// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { ExternalLink, LogOut, PanelLeft, PanelTop, User } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/UserAvatar';

export const LAYOUT_OPTIONS = [
  { value: 'tabs', label: 'Separadores no topo', hint: 'Grupos em cima, secções por baixo', icon: PanelTop },
  { value: 'sidebar', label: 'Barra lateral', hint: 'Tudo à esquerda; recolhe aos ícones', icon: PanelLeft },
];

/**
 * A conta, no canto do painel: quem está, a disposição do painel (separadores ou barra lateral),
 * o perfil, a loja e sair.
 */
export default function AdminUserMenu({ user, roleLabel, layout, onLayoutChange, onProfile, onLogout }) {
  const name = user?.name || user?.email || 'Conta';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-2 rounded-full pl-0.5 pr-0.5 outline-hidden ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:pr-3"
        aria-label={`Conta: ${name}`}
      >
        <UserAvatar user={user} size="sm" />
        <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          {user?.email && user.email !== name && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
          {roleLabel && (
            <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{roleLabel}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Disposição do painel</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout} onValueChange={onLayoutChange}>
          {LAYOUT_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="items-start py-2">
              <Icon className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block text-sm">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onProfile}>
          <User className="mr-2 h-4 w-4" aria-hidden="true" /> O meu perfil
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Ver a loja
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Terminar sessão
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Atalhos: <kbd className="font-sans font-medium text-foreground">Ctrl K</kbd> procurar ·{' '}
          <kbd className="font-sans font-medium text-foreground">Ctrl B</kbd> mostrar ou esconder o menu
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
