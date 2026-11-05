import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/**
 * "Terminar sessão em todos os dispositivos", no separador Segurança do perfil.
 *
 * A confirmação fica no próprio cartão, e não num `confirm()`: termina também a sessão deste
 * navegador, e quem carrega por engano tem de ver isso antes. O erro aparece no cartão porque,
 * se a revogação falhar, a pessoa continua com sessão aberta noutros sítios e precisa de saber.
 */
export default function SignOutEverywhere() {
  const { logoutEverywhere } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await logoutEverywhere();
      toast({ title: 'Sessão terminada em todos os dispositivos', description: 'Nos outros dispositivos termina em menos de uma hora.' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Não foi possível terminar as sessões.');
      setBusy(false);
    }
  };

  return (
    <section className="bg-card border rounded-xl p-6 max-w-lg mt-6" aria-labelledby="sessoes-titulo">
      <h3 id="sessoes-titulo" className="font-bold text-lg mb-1">Sessões abertas</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Termina a sessão neste e em todos os outros dispositivos onde entrou com esta conta. Use-o se
        entrou num computador que não é seu ou se suspeita que alguém usa a sua conta.
      </p>

      {!confirming ? (
        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Terminar sessão em todos os dispositivos
        </Button>
      ) : (
        <div role="group" aria-label="Confirmar" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm">
            Vai sair também deste navegador. Nos outros dispositivos, a sessão termina em menos de uma hora.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" onClick={run} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Sim, terminar todas
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setConfirming(false); setError(''); }} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
