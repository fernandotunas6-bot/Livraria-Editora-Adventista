// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { checkoutFingerprint, nextCheckoutAttempt } from './checkoutIdempotency';

const pedido = {
  items: [{ variant_id: 'a-default', quantity: 1 }],
  customerEmail: 'cliente@exemplo.ao',
  shippingMethod: 'delivery',
  checkoutSignature: 'data:image/png;base64,AAA',
};

describe('nextCheckoutAttempt', () => {
  it('repete a chave quando o pedido é o mesmo (repetição depois de a rede cair)', () => {
    const primeira = nextCheckoutAttempt(null, pedido);
    expect(primeira.key).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(nextCheckoutAttempt(primeira, { ...pedido }).key).toBe(primeira.key);
  });

  it('voltar a assinar não muda a chave', () => {
    const primeira = nextCheckoutAttempt(null, pedido);
    expect(nextCheckoutAttempt(primeira, { ...pedido, checkoutSignature: 'data:image/png;base64,BBB' }).key)
      .toBe(primeira.key);
  });

  it('muda a chave quando o carrinho ou os dados mudam', () => {
    const primeira = nextCheckoutAttempt(null, pedido);
    expect(nextCheckoutAttempt(primeira, { ...pedido, items: [{ variant_id: 'a-default', quantity: 2 }] }).key)
      .not.toBe(primeira.key);
    expect(nextCheckoutAttempt(primeira, { ...pedido, shippingMethod: 'pickup' }).key).not.toBe(primeira.key);
  });

  it('não depende da ordem das propriedades', () => {
    expect(checkoutFingerprint({ b: 1, a: { d: 2, c: 3 } })).toBe(checkoutFingerprint({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
