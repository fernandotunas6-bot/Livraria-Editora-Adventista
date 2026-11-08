import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User, ShoppingBag, LayoutDashboard, LogOut, ChevronDown, Settings, Shield, Sparkles, BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useColporteurMe } from '@/hooks/useColporteurMe';
import { adminPermissions } from '@/lib/adminSections';
import { accountHref, colporteurHref, staffShortcuts } from '@/lib/siteAreas';
import { useReaderStatus } from '@/hooks/useReader';
import ReaderBadge from '@/components/community/ReaderBadge';
import { getUserDisplayName, getUserFirstName } from '@/lib/userUtils';
import { cn } from '@/lib/utils';
import { ROLES } from '@/lib/permissions';

const groupLabel = 'px-2 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground';

/** O nível de leitor, por baixo do nome (pergunta quando o menu abre; depois fica guardado). */
function ReaderLevelLine() {
  const status = useReaderStatus();
  if (!status || status.level === 'novo') return null;
  return <ReaderBadge level={status.level} className="mt-1" />;
}

/** "Área do colportor", só para quem tem a ficha ligada à conta. Pergunta quando o menu abre. */
function ColporteurItems({ userId }) {
  const me = useColporteurMe(userId);
  if (!me) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel className={groupLabel}>Colportagem</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to={colporteurHref()} className="cursor-pointer">
            <BadgeCheck className="mr-2" /> Área do colportor
            {me.code && <span className="ml-auto font-mono text-[11px] text-muted-foreground">{me.code}</span>}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}

/**
 * Menu da conta, arrumado pelos contextos da pessoa: a sua conta; a colportagem, se é colportor;
 * e a equipa, se tem acesso ao painel — com os atalhos das secções que pode abrir.
 */
export function UserMenu({ compact = false, className }) {
  const { user, isAdmin, canAccessAdmin, hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'gap-2 px-2 hover:bg-marca/10 rounded-full h-auto py-1',
            className,
          )}
          aria-label="Menu da conta"
        >
          <UserAvatar user={user} size="md" className="ring-2 ring-marca/20" />
          {!compact && (
            <>
              <span className="hidden md:flex flex-col items-start text-left leading-tight max-w-[120px]">
                <span className="text-xs text-muted-foreground">Olá,</span>
                <span className="text-sm font-semibold truncate w-full">
                  {getUserFirstName(user)}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal p-3">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{getUserDisplayName(user)}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <ReaderLevelLine />
              {/* Quem é da equipa vê-o (o gestor também, não só o administrador), com o código FUN-. */}
              {(isAdmin || user?.role === 'manager') && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-primary">
                  <Shield className="h-3 w-3" aria-hidden="true" /> {ROLES[user?.role]?.label || 'Equipa'}
                  {user?.staff_code && <span className="font-mono text-muted-foreground">· {user.staff_code}</span>}
                </span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className={groupLabel}>A minha conta</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to="/profile" className="cursor-pointer">
              <User className="mr-2" /> Minha Conta
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={accountHref('orders')} className="cursor-pointer">
              <ShoppingBag className="mr-2" /> As Minhas Encomendas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/sugestoes" className="cursor-pointer">
              <Sparkles className="mr-2" /> Sugestões para si
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={accountHref('settings')} className="cursor-pointer">
              <Settings className="mr-2" /> Definições
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <ColporteurItems userId={user?.id} />

        {canAccessAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className={groupLabel}>Equipa</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/admin" className="cursor-pointer text-primary">
                  <LayoutDashboard className="mr-2" /> Painel da equipa
                </Link>
              </DropdownMenuItem>
              {/* As secções que esta pessoa pode abrir, as três mais usadas. */}
              {staffShortcuts(adminPermissions({ isAdmin, hasPermission }), 3).map(({ id, to, label, icon: Icon }) => (
                <DropdownMenuItem key={id} asChild>
                  <Link to={to} className="cursor-pointer pl-8">
                    <Icon className="mr-2 opacity-70" /> {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="mr-2" /> Terminar Sessão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function GuestAuthButton({ className, fullWidth = false }) {
  // Num modal, sem sair da página: quem entra pelo cabeçalho fica onde estava.
  const { openAuth } = useAuthDialog();

  return (
    <div className={cn('flex items-center gap-2', fullWidth && 'flex-col w-full', className)}>
      <Button
        variant="outline"
        size="sm"
        className={cn('rounded-full bg-transparent border-marca/30 hover:bg-marca/10', fullWidth && 'w-full')}
        onClick={() => openAuth({ mode: 'login' })}
      >
        <User className="h-4 w-4 mr-2" />
        Entrar
      </Button>
      <Button
        size="sm"
        className={cn('btn-primary rounded-full hidden sm:inline-flex', fullWidth && 'w-full sm:flex')}
        onClick={() => openAuth({ mode: 'signup' })}
      >
        Criar conta
      </Button>
    </div>
  );
}
