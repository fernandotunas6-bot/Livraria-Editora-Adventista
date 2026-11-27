// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDeadline } from '@/components/StaffMfaGate';
import { getStaffMfaStatus, mfaErrorMessage, setStaffMfaPolicy } from '@/lib/mfa';

/**
 * A verificação em dois passos da equipa (só administradores; migração 20261127150000). Por decisão do dono (27/11) é
 * opcional: cada pessoa activa-a no seu perfil. Aqui pode voltar a ser obrigatória para a equipa, com um prazo para a
 * activarem; cada mudança fica no registo de segurança.
 */
export default function PoliticaDoisPassos() {
  const { toast } = useToast();
  const [estado, setEstado] = useState(null);
  const [aMudar, setAMudar] = useState(false);
  const [dias, setDias] = useState('7');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setEstado(await getStaffMfaStatus());
    } catch {
      setEstado(null);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!estado || typeof estado.obrigatoria !== 'boolean') return null;
  const obrigatoria = estado.obrigatoria;
  const data = formatDeadline(estado.enforce_after);

  const mudar = async () => {
    setBusy(true);
    setErro('');
    try {
      const n = Math.min(90, Math.max(0, Number.parseInt(dias, 10) || 0));
      const novo = await setStaffMfaPolicy(!obrigatoria, n);
      setEstado(novo);
      setAMudar(false);
      toast({
        title: novo?.obrigatoria ? 'Verificação em dois passos obrigatória para a equipa' : 'Verificação em dois passos opcional',
        description: novo?.obrigatoria
          ? n ? `A equipa tem ${n} dia(s) para a activar no perfil.` : 'Vale já: quem da equipa não a tem activa vê o ecrã para a activar.'
          : 'Cada pessoa decide no seu perfil. Quem a activou continua a precisar do código.',
      });
    } catch (e) {
      // a recusa do servidor já vem em português («Só um administrador…»); o resto, com a mensagem dos dois passos
      setErro(/^[A-ZÀ-Ú][a-zà-ú]/.test(e?.message || '') ? e.message : mfaErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            {obrigatoria ? <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> : <ShieldQuestion className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            Verificação em dois passos da equipa: {obrigatoria ? 'obrigatória' : 'opcional'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {obrigatoria
              ? estado.enforced
                ? 'Quem da equipa não a tem activa só vê o ecrã para a activar.'
                : `A equipa tem de a activar no perfil${data ? ` até ${data}` : ''}; depois disso, o painel só abre com o código.`
              : 'Cada pessoa activa-a (ou retira-a) no seu perfil. Quem a activou continua a precisar do código para entrar no painel.'}
          </p>
        </div>
        {!aMudar && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setAMudar(true); setErro(''); }}>
            {obrigatoria ? 'Tornar opcional' : 'Tornar obrigatória'}
          </Button>
        )}
      </div>
      {aMudar && (
        <div className="mt-3 space-y-3 rounded-lg border border-dashed p-3">
          {obrigatoria ? (
            <p className="text-sm">
              Sem a obrigação, uma conta da equipa sem o código entra no painel só com a palavra-passe. Tornar opcional?
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="mfa-prazo-dias" className="text-sm">Dias para a equipa a activar (0 vale já)</Label>
              <Input id="mfa-prazo-dias" type="number" min="0" max="90" inputMode="numeric" className="w-28" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={mudar}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {obrigatoria ? 'Tornar opcional' : 'Tornar obrigatória'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAMudar(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="mt-2 text-sm text-destructive">{erro}</p>}
    </div>
  );
}
