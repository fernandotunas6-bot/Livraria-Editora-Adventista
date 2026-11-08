import React, { useEffect, useState } from 'react';
import { Heart, Package, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BrandLogo from '@/components/BrandLogo';
import AuthForm from '@/components/auth/AuthForm';
import { authDialogCopy } from '@/lib/authPrompt';

const BENEFITS = [
  { icon: Package, text: 'Acompanhe as encomendas' },
  { icon: Heart, text: 'Guarde livros para depois' },
  { icon: Zap, text: 'Compre mais depressa' },
];

/**
 * O modal de entrar / criar conta. Aberto pelo `AuthDialogProvider`; o formulário é o mesmo da
 * página /login (`AuthForm`).
 */
export default function AuthDialog({ request, returnPath, onOpenChange, onDone }) {
  const [mode, setMode] = useState(request?.mode || 'signup');
  useEffect(() => { if (request) setMode(request.mode); }, [request]);

  const copy = authDialogCopy(request?.reason, mode);

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-60 max-h-[92dvh] overflow-y-auto sm:max-w-md p-0 gap-0 rounded-2xl"
        // O carrinho fecha-se com Esc ouvido na janela; sem isto, fechar o modal fechava os dois.
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 bg-linear-to-b from-primary/10 to-transparent rounded-t-2xl">
          <div className="mb-4"><BrandLogo linkTo={null} /></div>
          <DialogHeader className="text-left space-y-1.5">
            <DialogTitle className="text-xl">{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          {copy.benefits && mode === 'signup' && (
            <ul className="mt-4 grid grid-cols-3 gap-2 text-[11px] leading-tight text-muted-foreground">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex flex-col items-center gap-1.5 rounded-lg bg-card/70 border p-2 text-center">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 pb-6 pt-2">
          {request && (
            <AuthForm
              key={request.key}
              initialMode={request.mode}
              defaultEmail={request.defaultEmail}
              defaultName={request.defaultName}
              returnPath={returnPath}
              onModeChange={setMode}
              onDone={onDone}
              onNavigateAway={() => onOpenChange(false)}
            />
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-3 block w-full py-2 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {copy.dismiss}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
