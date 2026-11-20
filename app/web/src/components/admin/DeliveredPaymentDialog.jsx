// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { outstanding } from '@/lib/payments';

const kz = (n) => `Kz ${Number(n || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}`;

/**
 * Marcar "Entregue" uma encomenda com dinheiro por receber (pagamento na entrega, balcão). Quem
 * entrega diz quanto recebeu — fica confirmado, ou por confirmar na caixa se não tiver a
 * permissão "Confirmar pagamentos" — ou porque entrega sem pagamento (vai para o registo de
 * segurança e avisa os administradores). Foi o que faltou à encomenda de 245 000 Kz entregue
 * com o pagamento pendente, em produção, a 2026-11-07.
 */
export default function DeliveredPaymentDialog({ order, canConfirm, currentUserName = '', onCancel, onSubmit }) {
  const [mode, setMode] = useState('paid');
  const [amount, setAmount] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    setMode('paid');
    setAmount(String(outstanding(order) || ''));
    setCollectedBy(currentUserName);
    setReference('');
    setReason('');
    setError('');
  }, [order, currentUserName]);

  if (!order) return null;
  const due = outstanding(order);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    let extra;
    if (mode === 'paid') {
      const value = Number(String(amount).replace(',', '.'));
      if (!(value > 0)) { setError('Indique o valor que recebeu.'); return; }
      extra = { payment: { amount: value, collectedBy: collectedBy.trim(), reference: reference.trim(), methodCode: order.payment_method_code || '' } };
    } else {
      if (reason.trim().length < 5) { setError('Diga porque entrega sem pagamento.'); return; }
      extra = { unpaidReason: reason.trim() };
    }
    setBusy(true);
    try {
      await onSubmit(extra);
    } catch (err) {
      setError(err.message || 'Não foi possível marcar como entregue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Entregar {order.order_number || ''}</DialogTitle>
            <DialogDescription>
              Esta encomenda tem <strong>{kz(due)}</strong> por receber ({order.payment_method_name || 'pagamento'}).
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={mode} onValueChange={setMode} className="space-y-2">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="paid" className="mt-0.5" />
              <span>
                Recebi o pagamento
                <span className="block text-xs text-muted-foreground">
                  {canConfirm ? 'Fica confirmado.' : 'Fica por confirmar na caixa, quando o dinheiro lá chegar.'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="unpaid" className="mt-0.5" />
              <span>
                Entregar sem pagamento
                <span className="block text-xs text-muted-foreground">Os administradores são avisados, com o motivo.</span>
              </span>
            </label>
          </RadioGroup>

          {mode === 'paid' ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="entrega-valor" className="text-xs">Valor recebido (Kz)</Label>
                <Input id="entrega-valor" type="number" min="0" step="0.01" inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="entrega-quem" className="text-xs">Quem recebeu</Label>
                <Input id="entrega-quem" value={collectedBy} maxLength={120} onChange={(e) => setCollectedBy(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="entrega-ref" className="text-xs">Referência (talão do TPA ou da transferência, opcional)</Label>
                <Input id="entrega-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="entrega-motivo" className="text-xs">Motivo</Label>
              <Textarea id="entrega-motivo" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: crédito aprovado pelo responsável da loja" required />
            </div>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Marcar como entregue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
