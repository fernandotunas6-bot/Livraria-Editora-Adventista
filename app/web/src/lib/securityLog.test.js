// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { actorLabel, areaLabel, changeRows, filterRows, formatValue } from './securityLog';

describe('actorLabel', () => {
  it('mostra o email de quem fez, quando há', () => {
    expect(actorLabel({ actor_email: 'ana@loja.ao', actor_kind: 'conta' })).toBe('ana@loja.ao');
  });

  it('sem conta, diz de onde veio a alteração', () => {
    expect(actorLabel({ actor_kind: 'sql' })).toBe('Acesso directo à base de dados');
    expect(actorLabel({ actor_kind: 'login' })).toBe('Sistema de login');
    expect(actorLabel({ actor_kind: 'agendador' })).toBe('Tarefa automática');
    expect(actorLabel({ actor_kind: 'servidor' })).toBe('Servidor (API)');
    expect(actorLabel({})).toBe('Desconhecido');
  });
});

describe('formatValue', () => {
  it('traduz vazios e booleanos', () => {
    expect(formatValue(null)).toBe('(vazio)');
    expect(formatValue('')).toBe('(vazio)');
    expect(formatValue(undefined)).toBe('(vazio)');
    expect(formatValue(true)).toBe('sim');
    expect(formatValue(false)).toBe('não');
  });

  it('mostra números, texto e objectos', () => {
    expect(formatValue(1500)).toBe('1500');
    expect(formatValue('IBAN AO06')).toBe('IBAN AO06');
    expect(formatValue({ manage_orders: true })).toBe('{"manage_orders":true}');
  });
});

describe('changeRows', () => {
  it('põe nomes legíveis e ordena pelo nome', () => {
    const rows = changeRows({
      whatsapp: { de: '+244 900', para: '+244 911' },
      account_info: { de: 'IBAN A', para: 'IBAN B' },
    });
    expect(rows).toEqual([
      { field: 'account_info', label: 'Conta / IBAN', from: 'IBAN A', to: 'IBAN B' },
      { field: 'whatsapp', label: 'WhatsApp', from: '+244 900', to: '+244 911' },
    ]);
  });

  it('segredos chegam já mascarados da base e ficam assim', () => {
    expect(changeRows({ brevo_api_key: { de: '(vazio)', para: '(alterado)' } })[0])
      .toMatchObject({ label: 'brevo_api_key', from: '(vazio)', to: '(alterado)' });
  });

  it('aguenta valores estranhos sem rebentar', () => {
    expect(changeRows(null)).toEqual([]);
    expect(changeRows([])).toEqual([]);
    expect(changeRows({ role: null })).toEqual([{ field: 'role', label: 'Papel', from: '(vazio)', to: '(vazio)' }]);
  });
});

describe('filterRows', () => {
  const rows = [
    { id: 1, table_name: 'payment_methods', alerted: true, summary: 'Dados de pagamento alterados: BAI', actor_email: 'ana@loja.ao', changes: { account_info: { de: 'A', para: 'B' } } },
    { id: 2, table_name: 'orders', alerted: false, summary: 'Encomenda ENC-1: pagamento pending → paid', actor_kind: 'servidor' },
    { id: 3, table_name: 'profiles', alerted: true, summary: 'Permissões alteradas: rui@loja.ao (member → manager)', actor_kind: 'sql' },
  ];

  it('sem filtros devolve tudo', () => {
    expect(filterRows(rows).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('filtra por área e pelos que avisaram', () => {
    expect(filterRows(rows, { area: 'orders' }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { alertedOnly: true }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('procura no resumo, no autor e nos valores, sem ligar a maiúsculas', () => {
    expect(filterRows(rows, { query: 'ANA@' }).map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, { query: 'base de dados' }).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, { query: 'enc-1' }).map((r) => r.id)).toEqual([2]);
  });

  it('a área tem nome legível', () => {
    expect(areaLabel('payment_methods')).toBe('Pagamentos');
    expect(areaLabel('outra')).toBe('outra');
  });
});
