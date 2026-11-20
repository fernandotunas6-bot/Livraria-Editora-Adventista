// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Peças comuns aos separadores do registo da Igreja. Os selects são nativos: as listas têm
// dezenas de distritos e pastores, e no telemóvel o select do sistema é o mais fácil de usar.

export function NativeSelect({ value, onChange, children, className, ...props }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={cn('flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base md:text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormField({ label, hint, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Pesquisar…' }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function Toolbar({ children }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function DataTable({ head, children, empty = 'Nada para mostrar.', count }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length ? rows : (
            <tr><td colSpan={head.length} className="px-3 py-10 text-center text-muted-foreground">{empty}</td></tr>
          )}
        </tbody>
      </table>
      {typeof count === 'number' && rows.length > 0 && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{count} {count === 1 ? 'registo' : 'registos'}</p>
      )}
    </div>
  );
}

export function Pill({ tone = 'muted', children }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
}

/** Província → município, em cascata. Mudar a província limpa o município. */
export function ProvinceMunicipality({ provinces, municipalities, provinceId, municipalityId, onChange, required = false }) {
  const list = municipalities.filter((m) => m.province === provinceId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={`Província${required ? ' *' : ''}`}>
        <NativeSelect value={provinceId || ''} onChange={(v) => onChange({ province_id: v, municipality_id: '' })}>
          <option value="">— escolher —</option>
          {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      </FormField>
      <FormField label="Município">
        <NativeSelect value={municipalityId || ''} onChange={(v) => onChange({ province_id: provinceId, municipality_id: v })} disabled={!provinceId}>
          <option value="">— {provinceId ? 'escolher' : 'escolha a província'} —</option>
          {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </NativeSelect>
      </FormField>
    </div>
  );
}
