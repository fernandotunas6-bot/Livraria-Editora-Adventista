// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { lojaComZonas } from './StoreAvailability';

describe('lojaComZonas', () => {
  it('a cidade da loja e as províncias que serve', () => {
    expect(lojaComZonas({ name: 'Livraria Adventista — Lubango', province: 'Huíla', service_provinces: ['Huíla', 'Namibe', 'Cunene'] }))
      .toBe('Lubango (Huíla, Namibe e Cunene)');
    expect(lojaComZonas({ name: 'Livraria Adventista — Catumbela', province: 'Benguela', service_provinces: ['Benguela', 'Cuanza Sul'] }))
      .toBe('Catumbela (Benguela e Cuanza Sul)');
  });

  it('só a cidade, quando a loja serve apenas a sua terra', () => {
    expect(lojaComZonas({ name: 'Livraria Adventista — Huambo', province: 'Huambo', service_provinces: ['Huambo'] })).toBe('Huambo');
    expect(lojaComZonas({ name: 'Livraria Adventista — Huambo', province: 'Huambo' })).toBe('Huambo');
  });

  it('um nome fora do modelo fica como está', () => {
    expect(lojaComZonas({ name: 'Loja Central', province: 'Luanda', service_provinces: ['Luanda', 'Bengo'] })).toBe('Loja Central (Luanda e Bengo)');
  });
});
