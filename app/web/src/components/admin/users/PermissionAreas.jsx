// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { LayoutList } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@/lib/permissions';
import {
  ADMIN_GROUPS, adminOnlySections, buildAdminNav, permissionsOfAccount, sectionsOpenedBy,
} from '@/lib/adminSections';

/**
 * As permissões arrumadas como a navegação do painel: por área (Catálogo, Vendas, Clientes,
 * Igreja, Sistema), cada uma com as secções que abre, e o menu que a pessoa vai ter. Tudo
 * calculado do registo das secções (lib/adminSections.js), o mesmo que desenha o painel: o que
 * aqui se lê é o que a pessoa vai ver.
 */

const AREA_ORDER = ADMIN_GROUPS.map((g) => g.id);
const areaLabel = (id) => ADMIN_GROUPS.find((g) => g.id === id)?.label || 'Outras';

/** [{ area, label, items: [[key, permissão]] }], pela ordem dos grupos do painel. */
export function permissionsByArea() {
  const groups = new Map();
  for (const entry of Object.entries(PERMISSIONS)) {
    const area = entry[1].area || 'outras';
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (AREA_ORDER.indexOf(a) + 1 || 99) - (AREA_ORDER.indexOf(b) + 1 || 99))
    .map(([area, items]) => ({ area, label: areaLabel(area), items }));
}

/** "Abre: Produtos, Coleções… · Registo da Igreja (só leitura)". */
export function opensText(key) {
  const list = sectionsOpenedBy(key);
  if (!list.length) return '';
  return list.map((s) => (s.readOnly ? `${s.label} (só leitura)` : s.label)).join(', ');
}

/** Os interruptores das permissões de um gestor, por área. */
export function PermissionSwitches({ value = {}, onChange, disabled = false }) {
  return (
    <div className="space-y-4">
      {permissionsByArea().map((group) => (
        <fieldset key={group.area} className="space-y-2.5">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</legend>
          {group.items.map(([key, p]) => {
            const opens = opensText(key);
            return (
              <label key={key} className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={!!value[key]}
                  disabled={disabled}
                  onCheckedChange={(v) => onChange?.({ ...value, [key]: v })}
                  aria-describedby={`perm-${key}-desc`}
                />
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span id={`perm-${key}-desc`} className="block text-xs text-muted-foreground">
                    {p.description}
                    {opens && <span className="mt-0.5 block text-foreground/70">Abre: {opens}</span>}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

/**
 * O menu do painel desta pessoa, tal como o vai ver: as áreas e as secções. Para o administrador,
 * tudo; para um cliente, nada.
 */
export function PermissionMenuPreview({ role, permissions, className }) {
  if (role !== 'admin' && role !== 'manager') return null;
  const nav = buildAdminNav(permissionsOfAccount({ role, permissions }))
    .map((g) => ({ ...g, items: g.items.filter((i) => i.id !== 'inicio') }))
    .filter((g) => g.items.length > 0);
  const adminOnly = role === 'admin' ? [] : adminOnlySections();
  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <LayoutList className="h-3.5 w-3.5" aria-hidden="true" /> O menu desta pessoa no painel
      </p>
      {nav.length === 0 ? (
        <p className="text-sm text-muted-foreground">Só o Início: sem nenhuma permissão, não vê nenhuma secção.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {nav.map((g) => (
            <li key={g.id} className="flex flex-wrap gap-x-1.5">
              <span className="font-medium">{g.label}:</span>
              <span className="text-muted-foreground">
                {g.items.map((i) => (i.readOnly ? `${i.label} (só leitura)` : i.label)).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adminOnly.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Só para administradores: {adminOnly.map((s) => s.label).join(', ')}.</p>
      )}
    </div>
  );
}
