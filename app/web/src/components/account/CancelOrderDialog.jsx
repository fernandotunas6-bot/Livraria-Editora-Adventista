// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cancelOrder } from '@/api/PlatformApi';

/**
 * Confirmação do cancelamento pelo cliente (conta e rastreio). `orderNumber` aberto = diálogo
 * aberto. Com sessão, o servidor reconhece a conta; sem ela, vale o email do rastreio.
 */
export default function CancelOrderDialog({ orderNumber, email = '', onClose, onCancelled }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (orderNumber) setReason(''); }, [orderNumber]);

  const confirm = async () => {
    setBusy(true);
    try {
      await cancelOrder({ orderNumber, email, reason });
      toast.success(`Encomenda ${orderNumber} cancelada`, { description: 'Não há nada a pagar. A loja já foi avisada.' });
      onCancelled?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={!!orderNumber} onOpenChange={(open) => { if (!open && !busy) onClose?.(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar a encomenda {orderNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Os livros voltam à loja e não há nada a pagar. Não se pode desfazer: se mudar de ideias, faça uma encomenda nova.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Porque cancela? (opcional)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            placeholder="Ex.: enganei-me na morada, já comprei noutro sítio…"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Ajuda a loja a melhorar. Fica no histórico da encomenda.</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Manter a encomenda</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Cancelar a encomenda
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
