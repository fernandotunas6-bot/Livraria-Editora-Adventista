import { describe, expect, it } from 'vitest';
import { paymentSetupChecks } from './paymentSetup';

// O estado de produção a 2026-11-08: sem nome legal, NIF, telefone nem WhatsApp; prazo 0;
// transferência com IBAN; Multicaixa desligado; gateway por ligar.
const PRODUCAO = {
  settings: { company_legal_name: '', company_nif: '', contact_phone: '', whatsapp: '' },
  rules: { unpaid_cancel_days: 0 },
  methods: [
    { code: 'entrega', name: 'Pagamento na Entrega', type: 'offline', enabled: true },
    { code: 'transferencia', name: 'Transferência Bancária', type: 'transfer', enabled: true, account_info: 'IBAN AO06…' },
    { code: 'multicaixa', name: 'Multicaixa Express', type: 'p2p', enabled: false },
    { code: 'balcao', name: 'Pagar no Balcão', type: 'offline', enabled: true },
  ],
  gateway: { configured: false },
};

describe('o que falta para os clientes pagarem', () => {
  it('o estado de produção: recibo, contacto e prazo (nada de crítico)', () => {
    const items = paymentSetupChecks(PRODUCAO);
    expect(items.map((i) => i.id)).toEqual(['recibo', 'contacto', 'prazo']);
    expect(items.find((i) => i.id === 'recibo').action).toMatchObject({ section: 'settings', view: 'contact' });
    expect(items.find((i) => i.id === 'prazo').action).toMatchObject({ section: 'settings', view: 'rules' });
  });

  it('um método de pagar antes activo sem IBAN, número, link nem QR é crítico, e vem primeiro', () => {
    const methods = PRODUCAO.methods.map((m) => (m.code === 'multicaixa' ? { ...m, enabled: true } : m));
    const items = paymentSetupChecks({ ...PRODUCAO, methods });
    expect(items[0]).toMatchObject({ id: 'sem-dados-multicaixa', severity: 'critical' });
    // … e, com o gateway por ligar, diz que é confirmado à mão.
    expect(items.map((i) => i.id)).toContain('gateway');
  });

  it('com tudo preenchido, a lista fica vazia', () => {
    expect(paymentSetupChecks({
      settings: { company_legal_name: 'Livraria e Editora Adventista, Lda', company_nif: '5000000000', contact_phone: '+244 923 000 000' },
      rules: { unpaid_cancel_days: 3 },
      methods: PRODUCAO.methods,
      gateway: { configured: true },
    })).toEqual([]);
  });

  it('sem poder ler as regras da loja, não fala do prazo; sem métodos activos, é crítico', () => {
    expect(paymentSetupChecks({ ...PRODUCAO, rules: null }).map((i) => i.id)).not.toContain('prazo');
    expect(paymentSetupChecks({ ...PRODUCAO, methods: [] })[0]).toMatchObject({ id: 'sem-metodos', severity: 'critical' });
  });
});
