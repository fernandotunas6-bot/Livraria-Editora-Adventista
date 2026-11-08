import React, { useEffect, useState } from 'react';
import { PackageSearch, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import AdminNavBadge from '@/components/admin/shell/AdminNavBadge';

/**
 * Procurar no painel (Ctrl+K ou ⌘K, ou o campo do topo): ir para qualquer secção pelo nome,
 * e procurar logo uma encomenda (número, cliente, telefone) ou um produto (título, código).
 * Com 22 secções em 7 grupos, é o caminho mais curto — e o mesmo nas duas disposições.
 */
export default function AdminCommandPalette({ open, onOpenChange, nav, onNavigate, onSearchOrders, onSearchProducts }) {
  const [query, setQuery] = useState('');
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // Ctrl+K / ⌘K abre e fecha, em qualquer sítio do painel.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const run = (fn) => {
    onOpenChange(false);
    fn();
  };
  const term = query.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] translate-y-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Procurar no painel</DialogTitle>
        <DialogDescription className="sr-only">Escreva o nome de uma secção, um número de encomenda ou um produto.</DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:py-2.5"
          filter={(value, search, keywords) => {
            const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            if (value.startsWith('acao:')) return 1;
            const hay = fold(`${value} ${(keywords || []).join(' ')}`);
            return fold(search).split(/\s+/).filter(Boolean).every((w) => hay.includes(w)) ? 1 : 0;
          }}
        >
          <CommandInput value={query} onValueChange={setQuery} placeholder="Secção, nº de encomenda, cliente ou produto…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Nenhuma secção com esse nome.</CommandEmpty>
            {term && (onSearchOrders || onSearchProducts) && (
              <CommandGroup heading="Procurar">
                {onSearchOrders && (
                  <CommandItem value={`acao:encomendas ${term}`} onSelect={() => run(() => onSearchOrders(term))}>
                    <ShoppingBag className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Encomendas com «{term}»
                  </CommandItem>
                )}
                {onSearchProducts && (
                  <CommandItem value={`acao:produtos ${term}`} onSelect={() => run(() => onSearchProducts(term))}>
                    <PackageSearch className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Produtos com «{term}»
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            {nav.map((group) => (
              <CommandGroup key={group.id} heading={group.label || 'Painel'}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.title}`}
                      keywords={[item.description, group.label]}
                      onSelect={() => run(() => onNavigate(item.id))}
                    >
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <AdminNavBadge badge={item.badge} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
