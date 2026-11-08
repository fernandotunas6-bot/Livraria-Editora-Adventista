import React, { useEffect, useState } from 'react';
import { History, Mail, PackageSearch, Pencil, Phone, ShoppingBag } from 'lucide-react';
import { detectQuery, parseRecent } from '@/lib/adminSearch';
import { findSection, findView, flattenViews } from '@/lib/adminSections';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import AdminNavBadge from '@/components/admin/shell/AdminNavBadge';

/**
 * Procurar no painel (Ctrl+K ou ⌘K, ou o campo do topo): ir para qualquer secção pelo nome,
 * e procurar logo uma encomenda (número, cliente, telefone) ou um produto (título, código).
 * Com 22 secções em 7 grupos, é o caminho mais curto — e o mesmo nas duas disposições.
 *
 * Com alguma coisa escrita, encontra também as vistas de cada secção ("contas colportagem",
 * "envio", "pastores") e abre a secção já nessa vista. Só as que a pessoa pode abrir.
 */
export default function AdminCommandPalette({
  open, onOpenChange, nav, onNavigate, onSearchOrders, onSearchProducts, recents = [], findProduct, onEditProduct,
}) {
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
  // O que se escreveu: um código de produto, um número de encomenda, um email, um telefone?
  const detected = detectQuery(term);
  const product = detected.kind === 'product' && findProduct ? findProduct(detected.value) : null;
  // As recentes trazem a vista onde se estava (Colportagem › Contas), se a pessoa ainda a pode abrir.
  const recentItems = recents.map((entry) => {
    const { section, view } = parseRecent(entry);
    const item = findSection(nav, section);
    return item ? { item, view: findView(item, view) } : null;
  }).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] translate-y-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Procurar no painel</DialogTitle>
        <DialogDescription className="sr-only">Escreva o nome de uma secção, um número de encomenda ou um produto.</DialogDescription>
        <Command
          className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:py-2.5"
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
            {/* Reconhecido: a acção certa primeiro. */}
            {detected.kind === 'product' && (product && onEditProduct ? (
              <CommandGroup heading="Ir directamente">
                <CommandItem value={`acao:produto ${detected.value}`} onSelect={() => run(() => onEditProduct(product))}>
                  <Pencil className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">Editar {detected.value} · {product.title}</span>
                </CommandItem>
              </CommandGroup>
            ) : onSearchProducts && (
              <CommandGroup heading="Ir directamente">
                <CommandItem value={`acao:produto ${detected.value}`} onSelect={() => run(() => onSearchProducts(detected.value))}>
                  <PackageSearch className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Produtos com o código {detected.value}
                </CommandItem>
              </CommandGroup>
            ))}
            {['order', 'email', 'phone'].includes(detected.kind) && onSearchOrders && (
              <CommandGroup heading="Ir directamente">
                <CommandItem value={`acao:encomenda ${detected.value}`} onSelect={() => run(() => onSearchOrders(detected.value))}>
                  {detected.kind === 'email' ? <Mail className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    : detected.kind === 'phone' ? <Phone className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      : <ShoppingBag className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  {detected.kind === 'order' ? `Abrir a encomenda ${detected.value}`
                    : detected.kind === 'email' ? `Encomendas de ${detected.value}`
                      : `Encomendas do telefone ${detected.value}`}
                </CommandItem>
              </CommandGroup>
            )}
            {!term && recentItems.length > 0 && (
              <CommandGroup heading="Recentes">
                {recentItems.map(({ item, view }) => {
                  const Icon = view?.icon || item.icon;
                  return (
                    <CommandItem
                      key={`recente-${item.id}`}
                      value={`recente ${item.label} ${view?.label || ''}`}
                      onSelect={() => run(() => onNavigate(item.id, view ? { view: view.id } : {}))}
                    >
                      <History className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 truncate">
                        {view ? <><span className="text-muted-foreground">{item.label} › </span>{view.label}</> : item.label}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {detected.kind === 'text' && (onSearchOrders || onSearchProducts) && (
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
                      keywords={[item.description, group.label, item.keywords]}
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
            {term && (
              <CommandGroup heading="Dentro das secções">
                {flattenViews(nav).map((v) => {
                  const Icon = v.icon || v.sectionIcon;
                  return (
                    <CommandItem
                      key={`vista-${v.section}-${v.id}`}
                      value={`${v.sectionLabel} ${v.label}`}
                      keywords={[v.description, v.groupLabel, v.group, v.keywords]}
                      onSelect={() => run(() => onNavigate(v.section, { view: v.id }))}
                    >
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 truncate">
                        <span className="text-muted-foreground">{v.sectionLabel} › </span>{v.label}
                      </span>
                      <AdminNavBadge badge={v.badge && v.badge.tone !== 'count' ? v.badge : null} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
