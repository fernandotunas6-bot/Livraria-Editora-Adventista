// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  isPickupOrder, orderDeliveryAddress, orderLocality, orderPaymentCode, orderPaymentLabel, orderPickupStore,
} from './orderUtils';
import * as edge from '../../../../supabase/functions/app/orderFields.ts';

// As encomendas guardam o mesmo facto em várias colunas (ver orderUtils.js). O site e a Edge
// Function lêem-nas cada um com o seu módulo; estes casos — tirados das encomendas que
// existem na base de dados — fixam a regra e confirmam que os dois dizem o mesmo.
const CASES = {
  // ENC-D8BM5D: era PocketBase, entrega, só com os campos herdados.
  antigaEntrega: {
    shipping_method: '', payment_method: 'entrega', payment_method_code: 'entrega', payment_method_name: '',
    address: 'Rua Teste 1', city: 'Luanda', delivery_address_full: '',
  },
  // ENC-D9IBRY: levantamento antigo, a loja só em `address`.
  antigoLevantamento: {
    shipping_method: 'pickup', payment_method: 'entrega', payment_method_code: 'entrega', payment_method_name: '',
    address: 'Levantamento: Loja Central', city: 'Luanda', pickup_store: '',
  },
  // ENC-ZC8QZO4P2: levantamento já com os campos actuais (e `city` com o nome da loja).
  novoLevantamento: {
    shipping_method: 'pickup', payment_method: '', payment_method_code: 'balcao', payment_method_name: 'Pagar no Balcão',
    address: 'Levantamento: Livraria Adventista - Huambo', city: 'Livraria Adventista - Huambo',
    pickup_store: 'Livraria Adventista - Huambo',
  },
  // Entrega feita depois desta limpeza: sem `address` nem `payment_method`.
  novaEntrega: {
    shipping_method: 'delivery', payment_method_code: 'transferencia', payment_method_name: 'Transferência Bancária',
    delivery_address_full: 'Rua Direita 10, Bairro Azul, Luanda', delivery_locality: 'Bairro Azul',
    delivery_municipality: 'Luanda', delivery_province: 'Luanda', city: 'Luanda',
  },
};

describe('campos repetidos das encomendas', () => {
  it('método de pagamento: o nome gravado, o nome conhecido do código antigo, ou o código', () => {
    expect(orderPaymentLabel(CASES.antigaEntrega)).toBe('Pagamento na entrega');
    expect(orderPaymentLabel(CASES.novoLevantamento)).toBe('Pagar no Balcão');
    expect(orderPaymentLabel(CASES.novaEntrega)).toBe('Transferência Bancária');
    expect(orderPaymentLabel({ payment_method: 'transferencia' })).toBe('Transferência bancária');
    expect(orderPaymentLabel({ payment_method_code: 'multicaixa' })).toBe('multicaixa');
    expect(orderPaymentLabel({})).toBe('');
    expect(orderPaymentCode(CASES.antigaEntrega)).toBe('entrega');
  });

  it('levantamento: a loja, também nas encomendas que só a tinham em address', () => {
    expect(orderPickupStore(CASES.antigoLevantamento)).toBe('Loja Central');
    expect(orderPickupStore(CASES.novoLevantamento)).toBe('Livraria Adventista - Huambo');
    expect(orderPickupStore(CASES.novaEntrega)).toBe('');
  });

  it('morada de entrega numa linha, vazia nos levantamentos (a loja não aparece duas vezes)', () => {
    expect(orderDeliveryAddress(CASES.antigaEntrega)).toBe('Rua Teste 1, Luanda');
    expect(orderDeliveryAddress(CASES.novaEntrega)).toBe('Rua Direita 10, Bairro Azul, Luanda');
    expect(orderDeliveryAddress(CASES.novoLevantamento)).toBe('');
    expect(orderDeliveryAddress(null)).toBe('');
  });

  it('localidade escolhida no checkout', () => {
    expect(orderLocality(CASES.novaEntrega)).toBe('Bairro Azul · Luanda · Luanda');
    expect(orderLocality(CASES.antigaEntrega)).toBe('');
  });

  it('o site e a Edge Function dizem o mesmo em todos os casos', () => {
    for (const [name, order] of Object.entries(CASES)) {
      expect(edge.paymentLabel(order), name).toBe(orderPaymentLabel(order));
      expect(edge.paymentCode(order), name).toBe(orderPaymentCode(order));
      expect(edge.isPickupOrder(order), name).toBe(isPickupOrder(order));
      expect(edge.pickupStoreName(order), name).toBe(orderPickupStore(order));
      expect(edge.deliveryAddressLine(order), name).toBe(orderDeliveryAddress(order));
    }
  });
});
