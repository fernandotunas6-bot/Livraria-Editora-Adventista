import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteMyAccount, exportMyData } from '@/api/PlatformApi';
import { useBloqueios } from '@/lib/communityBlocks';

/**
 * Quem a pessoa bloqueou na comunidade (lib/communityBlocks.js), para poder desbloquear. Só aparece
 * com alguém na lista.
 */
export function PessoasBloqueadas() {
  const { lista, desbloquear } = useBloqueios();
  if (!lista.length) return null;
  const tirar = async (b) => {
    const err = await desbloquear(b.blocked_key);
    if (err) toast.error(err);
    else toast.success(`Desbloqueou ${b.blocked_name || 'esta pessoa'}`);
  };
  return (
    <div className="border-t pt-5" data-pessoas-bloqueadas>
      <p className="font-medium">Pessoas bloqueadas na comunidade</p>
      <p className="mt-0.5 text-sm text-muted-foreground">Não vê as publicações nem as respostas delas, e elas não sabem.</p>
      <ul className="mt-3 divide-y rounded-lg border">
        {lista.map((b) => (
          <li key={b.blocked_key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{b.blocked_name || 'Leitor'}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => tirar(b)}>Desbloquear</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nome do ficheiro: os-meus-dados-livraria-2026-11-08.json */
export const exportFileName = (date = new Date()) => `os-meus-dados-livraria-${date.toISOString().slice(0, 10)}.json`;

function saveJson(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Os direitos do cliente sobre os seus dados (Lei n.º 22/11), na própria conta: descarregar tudo o
 * que a loja guarda sobre ele e apagar a conta. Antes só se podia pedir pelos contactos da loja —
 * que hoje não recebem email nem têm telefone configurado.
 */
export default function AccountPrivacy({ user, isStaff, onDeleted }) {
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const email = String(user?.email || '');
  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email !== '';

  const download = async () => {
    setExporting(true);
    try {
      const data = await exportMyData();
      saveJson(data, exportFileName());
      toast.success('Os seus dados foram descarregados', { description: 'Um ficheiro JSON, que abre em qualquer editor de texto.' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    if (!matches) return;
    setDeleting(true);
    try {
      await deleteMyAccount(typed.trim());
      setOpen(false);
      toast.success('A sua conta foi apagada', { description: 'As encomendas continuam a poder ser rastreadas com o número e o email.' });
      onDeleted?.();
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-6" aria-labelledby="privacy-title">
      <h3 id="privacy-title" className="flex items-center gap-2 text-lg font-bold">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /> Os seus dados
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        O que a loja guarda sobre si, e porquê, está na <Link to="/privacidade" className="text-primary hover:underline">política de privacidade</Link>.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <p className="font-medium">Descarregar os meus dados</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Perfil, encomendas e pagamentos, lista de desejos, avaliações, publicações na comunidade, avisos e conversas de apoio.
          </p>
          <Button type="button" variant="outline" className="mt-3" onClick={download} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            Descarregar (JSON)
          </Button>
        </div>

        <PessoasBloqueadas />

        <div className="border-t pt-5">
          <p className="font-medium">Apagar a conta</p>
          {isStaff ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              É uma conta da equipa: só um administrador a pode apagar, no painel (Utilizadores), para não deixar encomendas nem permissões sem dono.
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Saem o perfil, a lista de desejos, as publicações e gostos na comunidade e os avisos. As encomendas ficam
                (a lei obriga a guardá-las) e continuam a poder ser rastreadas com o número e o email.
              </p>
              <Button
                type="button" variant="outline" className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { setTyped(''); setOpen(true); }}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Apagar a minha conta
              </Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={open} onOpenChange={(v) => { if (!deleting) setOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar a conta de vez?</AlertDialogTitle>
            <AlertDialogDescription>
              Não se pode desfazer. Para confirmar, escreva o email da conta: <strong className="text-foreground">{email}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">Email da conta</Label>
            <Input
              id="delete-confirm" type="email" autoComplete="off" value={typed}
              onChange={(e) => setTyped(e.target.value)} placeholder={email}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Manter a conta</AlertDialogCancel>
            <Button variant="destructive" onClick={remove} disabled={!matches || deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Apagar a conta
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
