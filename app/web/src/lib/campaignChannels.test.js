import { describe, expect, it } from 'vitest';
import { canalDeEnvio, emailEntrega, estadoDoAgendador, planearCanais } from './campaignChannels';
import * as edge from '../../../../supabase/functions/app/campaigns.ts';

// Dois módulos com a mesma regra: este vai no bundle do site, o da Edge Function corre no Deno
// e é quem envia. Estes casos fixam a regra e confirmam que os dois dizem o mesmo — sem isto,
// o painel podia dizer "entrega" e o agendador saltar a campanha, ou o contrário.

const ENTREGAS = [
  { email: false, whatsapp: false },
  { email: true, whatsapp: false },
  { email: false, whatsapp: true },
  { email: true, whatsapp: true },
];
const CANAIS = ['', null, 'email', 'whatsapp', 'both', 'sms'];

const DEFINICOES = [
  null,
  { order_email_enabled: false, smtp_host: 'smtp.exemplo.ao' },
  { order_email_enabled: true },
  { order_email_enabled: true, smtp_host: 'smtp.exemplo.ao' },
  { order_email_enabled: true, email_provider: 'sendgrid', smtp_host: 'smtp.exemplo.ao' },
  { order_email_enabled: true, email_provider: 'sendgrid', sendgrid_api_key: 'SG.x' },
];

describe('campaignChannels e a Edge Function dizem o mesmo', () => {
  it('emailEntrega concorda em todas as combinações de definições', () => {
    for (const s of DEFINICOES) {
      expect({ s, r: emailEntrega(s) }).toEqual({ s, r: edge.emailEntrega(s) });
    }
  });

  it('planearCanais e canalDeEnvio concordam em todas as combinações', () => {
    for (const canal of CANAIS) {
      for (const entrega of ENTREGAS) {
        const meu = planearCanais(canal, entrega);
        const dele = edge.planearCanais(canal, entrega);
        expect({ canal, entrega, ...meu }).toEqual({ canal, entrega, ...dele });
        expect(canalDeEnvio(meu)).toBe(edge.canalDeEnvio(dele));
      }
    }
  });

  it('os motivos são o mesmo texto: é o que o painel mostra e o agendador registou', () => {
    expect(MOTIVOS_DO_PAINEL).toEqual(MOTIVOS_DA_EDGE);
  });
});

// Os motivos não são exportados pela Edge Function (são detalhe interno dela), por isso
// comparam-se através do texto que `planearCanais` produz.
const MOTIVOS_DO_PAINEL = ['email', 'whatsapp'].map(
  (c) => planearCanais(c, { email: false, whatsapp: false }).motivo,
);
const MOTIVOS_DA_EDGE = ['email', 'whatsapp'].map(
  (c) => edge.planearCanais(c, { email: false, whatsapp: false }).motivo,
);

describe('estadoDoAgendador', () => {
  it('sem informação não afirma nada — a função publicada pode ser anterior a isto', () => {
    expect(estadoDoAgendador(null)).toBeNull();
    expect(estadoDoAgendador(undefined)).toBeNull();
  });

  it('pg_cron indisponível diz que só sai com o botão, e repete o motivo', () => {
    const r = estadoDoAgendador({ available: false, reason: 'pg_cron indisponível' });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('pg_cron indisponível');
    expect(r.text).toContain('Enviar pendentes');
  });

  it('instalado mas não activo', () => {
    const r = estadoDoAgendador({ available: true, scheduled: false, secrets: true });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('não activo');
  });

  it('agendado sem segredos é o caso traiçoeiro: corre e não chama nada', () => {
    const r = estadoDoAgendador({ available: true, scheduled: true, secrets: false });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('contact_campaigns_url');
    expect(r.text).toContain('sem aviso');
  });

  it('tudo em ordem mostra o horário', () => {
    const r = estadoDoAgendador({ available: true, scheduled: true, secrets: true, schedule: '*/15 * * * *' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('*/15 * * * *');
  });
});
