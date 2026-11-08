import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Mail, Phone, ShoppingBag, CalendarClock, LogIn, KeyRound, MessageCircle, Copy, Hash } from 'lucide-react';
import { personDataWarnings } from '@/lib/personDataChecks';
import { Button } from '@/components/ui/button';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { displayAngolaPhone, localDigits } from '@/lib/angolaPhone';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PERMISSIONS } from '@/lib/permissions';
import { PermissionMenuPreview } from './PermissionAreas';
import { listUserOrders } from '@/lib/usersApi';
import { listStaffRoles, loadTeamRoles } from '@/lib/staffRolesApi';
import { supabase } from '@/lib/supabaseClient';
import ReaderBadge from '@/components/community/ReaderBadge';
import { formatOrderNumber, getDeliveryStatusColor, getDeliveryStatusLabel, getPaymentStatusColor, getPaymentStatusLabel } from '@/lib/orderUtils';
import { CodeChip, PersonAvatar, Pill, ROLE_BADGE, PROVIDER_LABEL, accountState, formatDate, formatKz } from './userFormat';

function Info({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="wrap-break-word">{children}</div>
      </div>
    </div>
  );
}

/** Ficha de uma pessoa: dados da conta, permissões e histórico de encomendas. As acções vêm do módulo. */
export default function UserDetailSheet({ person, open, onOpenChange, actions }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // O nível de leitor do cliente (Leitor, assíduo, de honra) e os livros que comprou.
  const [reader, setReader] = useState(null);
  useEffect(() => {
    setReader(null);
    if (!open || !person?.id) return undefined;
    let alive = true;
    supabase.from('profiles').select('reader_level, reader_books, reader_via').eq('id', person.id).maybeSingle()
      .then(({ data, error }) => { if (alive && !error && data) setReader(data); });
    return () => { alive = false; };
  }, [open, person?.id]);
  // O cargo do gestor (Caixa, Atendimento…), ou «personalizado» sem cargo.
  const [cargo, setCargo] = useState(null);
  useEffect(() => {
    setCargo(null);
    if (!open || person?.role !== 'manager' || !person?.id) return undefined;
    let alive = true;
    Promise.all([listStaffRoles(), loadTeamRoles()])
      .then(([{ roles, missing }, team]) => {
        if (!alive || missing) return;
        setCargo(roles.find((r) => r.id === team[person.id])?.name || 'Personalizado');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, person?.id, person?.role]);

  useEffect(() => {
    if (!open || !person?.email) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    listUserOrders(person.email)
      .then((res) => { if (!cancelled) setOrders(res.items || []); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, person?.email]);

  if (!person) return null;
  const role = ROLE_BADGE[person.role] || ROLE_BADGE.member;
  const state = accountState(person);
  const activePermissions = Object.entries(PERMISSIONS).filter(([k]) => person.permissions?.[k] === true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            <PersonAvatar person={person} className="h-12 w-12" />
            <div className="min-w-0">
              <SheetTitle className="truncate">{person.name || person.email}</SheetTitle>
              <SheetDescription className="truncate">{person.email}</SheetDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2">
            <Pill className={role.className}>{role.label}</Pill>
            <Pill className={state.className}>{state.label}</Pill>
            {reader && reader.reader_level !== 'novo' && (
              <span className="inline-flex items-center gap-1" title={`${reader.reader_books} ${reader.reader_books === 1 ? 'livro pago' : 'livros pagos'}${reader.reader_via === 'participacao' ? ' · entrou pela participação' : ''}`}>
                <ReaderBadge level={reader.reader_level} size="md" />
                <span className="text-xs text-muted-foreground">{reader.reader_books} {reader.reader_books === 1 ? 'livro' : 'livros'}</span>
              </span>
            )}
            {(person.providers || []).map((p) => (
              <Pill key={p} className="bg-muted text-muted-foreground">{PROVIDER_LABEL[p] || p}</Pill>
            ))}
          </div>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {actions}

          {/* Contacto rápido */}
          <div className="flex flex-wrap gap-2">
            {localDigits(person.phone).length === 9 && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={buildWhatsAppUrl(person.phone, `Olá ${person.name || ''}!`)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4 mr-1" />WhatsApp
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:+244${localDigits(person.phone)}`}><Phone className="h-4 w-4 mr-1" />Ligar</a>
                </Button>
              </>
            )}
            {person.email && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${person.email}`}><Mail className="h-4 w-4 mr-1" />Email</a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(person.email)}>
                  <Copy className="h-4 w-4 mr-1" />Copiar email
                </Button>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold">{person.orders_count || 0}</p>
              <p className="text-[11px] text-muted-foreground">Encomendas</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-sm font-bold leading-7">{formatKz(person.orders_total)}</p>
              <p className="text-[11px] text-muted-foreground">Total gasto</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-sm font-bold leading-7">{formatDate(person.last_order_at)}</p>
              <p className="text-[11px] text-muted-foreground">Última compra</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Info icon={Mail} label="Email">{person.email || '—'}</Info>
            <Info icon={Phone} label="Telefone">{displayAngolaPhone(person.phone)}</Info>
            {person.customer_code && <Info icon={Hash} label="Código de cliente"><CodeChip code={person.customer_code} /></Info>}
            {person.staff_code && <Info icon={Hash} label="Código de funcionário"><CodeChip code={person.staff_code} /></Info>}
            {person.has_account && <Info icon={CalendarClock} label="Conta criada">{formatDate(person.created, true)}</Info>}
            {person.has_account && <Info icon={LogIn} label="Último acesso">{formatDate(person.last_sign_in_at, true)}</Info>}
          </div>

          {personDataWarnings(person).length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Dados por confirmar
              </p>
              {personDataWarnings(person).map((w) => (
                <p key={w} className="text-sm text-amber-800 dark:text-amber-200">{w}</p>
              ))}
            </div>
          )}

          {person.role === 'manager' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Permissões{cargo ? ` · cargo: ${cargo}` : ''}
              </p>
              {activePermissions.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {activePermissions.map(([k, p]) => <Pill key={k} className="bg-sky-500/10 text-sky-700 dark:text-sky-300">{p.label}</Pill>)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma permissão activa: este gestor não vê nada no painel.</p>
              )}
              {activePermissions.length > 0 && (
                <PermissionMenuPreview role={person.role} permissions={person.permissions} className="rounded-lg border p-3" />
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5" /> Encomendas
            </p>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não fez nenhuma encomenda.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {orders.map((o) => (
                  <li key={o.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{formatOrderNumber(o)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(o.created, true)} · {(o.items || []).reduce((n, it) => n + (Number(it.quantity) || 1), 0)} artigo(s)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill className={getPaymentStatusColor(o.payment_status)}>{getPaymentStatusLabel(o.payment_status)}</Pill>
                      <Pill className={getDeliveryStatusColor(o.delivery_status)}>{getDeliveryStatusLabel(o.delivery_status)}</Pill>
                      <span className="font-semibold">{formatKz(o.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
