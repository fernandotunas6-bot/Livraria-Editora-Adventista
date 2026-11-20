// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkoutMemoryKey, checkoutMemoryOff, hasMemorableData, readCheckoutMemory, saveCheckoutMemory, setCheckoutMemoryEnabled,
} from '@/lib/checkoutMemory';

const DIA = 24 * 60 * 60 * 1000;
const form = { name: 'Ana Silva', email: 'ana@exemplo.ao', phone: '+244923000000', shippingMethod: 'delivery', pickupStore: '', paymentReference: 'REF-1', notes: 'Tocar à campainha', colporteurCode: 'CPT-0007' };
const address = { provinceId: 'p1', provinceName: 'Luanda', municipalityId: 'm1', municipalityName: 'Talatona', localityName: 'Camama', street: 'Rua 1', reference: 'Junto à escola', phone: '+244923000000' };

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('checkoutMemoryKey', () => {
  it('por conta, ou do aparelho sem conta', () => {
    expect(checkoutMemoryKey('u1')).toBe('livraria:checkout:u1');
    expect(checkoutMemoryKey(null)).toBe('livraria:checkout:convidado');
  });
});

describe('hasMemorableData', () => {
  it('a província por omissão sozinha não conta', () => {
    expect(hasMemorableData({ form: { shippingMethod: 'delivery' }, address: { provinceName: 'Luanda' } })).toBe(false);
    expect(hasMemorableData({ form: { name: 'Ana' } })).toBe(true);
    expect(hasMemorableData({ address: { street: 'Rua 1' } })).toBe(true);
  });
});

describe('readCheckoutMemory / saveCheckoutMemory', () => {
  const key = checkoutMemoryKey('u1');

  it('lembra quem, contacto e morada, sem pagamento, notas nem colportor', () => {
    saveCheckoutMemory(key, { form, address }, 1_000);
    const mem = readCheckoutMemory(key, 2_000);
    expect(mem.form).toEqual({ name: 'Ana Silva', email: 'ana@exemplo.ao', phone: '+244923000000', shippingMethod: 'delivery', pickupStore: '' });
    expect(mem.address.street).toBe('Rua 1');
    expect(mem.address.reference).toBe('Junto à escola');
    const raw = localStorage.getItem(key);
    expect(raw).not.toContain('REF-1');
    expect(raw).not.toContain('campainha');
    expect(raw).not.toContain('CPT-0007');
  });

  it('cada conta tem os seus dados', () => {
    saveCheckoutMemory(key, { form, address });
    expect(readCheckoutMemory(checkoutMemoryKey('u2'))).toBeNull();
    expect(readCheckoutMemory(checkoutMemoryKey(null))).toBeNull();
  });

  it('esquece ao fim de 180 dias', () => {
    saveCheckoutMemory(key, { form, address }, 0);
    expect(readCheckoutMemory(key, 179 * DIA)).not.toBeNull();
    expect(readCheckoutMemory(key, 181 * DIA)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('sem nada para lembrar apaga o que havia', () => {
    saveCheckoutMemory(key, { form, address });
    saveCheckoutMemory(key, { form: { shippingMethod: 'delivery' }, address: { provinceName: 'Luanda' } });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('ignora valores estragados e corta textos enormes', () => {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), form: { name: 42, email: 'x'.repeat(1000) }, address: null }));
    const mem = readCheckoutMemory(key);
    expect(mem.form.name).toBe('');
    expect(mem.form.email).toHaveLength(300);
    localStorage.setItem(key, '{estragado');
    expect(readCheckoutMemory(key)).toBeNull();
  });

  it('com o armazenamento bloqueado não lança', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => saveCheckoutMemory(key, { form, address })).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(readCheckoutMemory(key)).toBeNull();
  });
});

describe('setCheckoutMemoryEnabled', () => {
  it('desligar apaga os dados de todas as contas e deixa de guardar', () => {
    saveCheckoutMemory(checkoutMemoryKey('u1'), { form, address });
    saveCheckoutMemory(checkoutMemoryKey(null), { form, address });
    localStorage.setItem('outra-coisa', 'fica');
    setCheckoutMemoryEnabled(false);
    expect(checkoutMemoryOff()).toBe(true);
    expect(localStorage.getItem(checkoutMemoryKey('u1'))).toBeNull();
    expect(localStorage.getItem(checkoutMemoryKey(null))).toBeNull();
    expect(localStorage.getItem('outra-coisa')).toBe('fica');
    saveCheckoutMemory(checkoutMemoryKey('u1'), { form, address });
    expect(localStorage.getItem(checkoutMemoryKey('u1'))).toBeNull();
  });

  it('ligar outra vez volta a guardar', () => {
    setCheckoutMemoryEnabled(false);
    setCheckoutMemoryEnabled(true);
    expect(checkoutMemoryOff()).toBe(false);
    saveCheckoutMemory(checkoutMemoryKey('u1'), { form, address });
    expect(readCheckoutMemory(checkoutMemoryKey('u1'))).not.toBeNull();
  });
});
