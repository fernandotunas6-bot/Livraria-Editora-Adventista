import { describe, expect, it } from 'vitest';
import { findSecrets } from './verificar-segredos.mjs';

// Os valores de teste são montados aos bocados, para o próprio verificador não os encontrar
// neste ficheiro quando corre sobre o repositório.
const j = (...parts) => parts.join('');
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${'x'.repeat(43)}`;

describe('findSecrets', () => {
  it('encontra as credenciais com prefixo próprio', () => {
    const samples = {
      'Chave secreta do Supabase': j('sb_', 'secret_', 'a'.repeat(32)),
      'Chave privada': j('-----BEGIN ', 'PRIVATE KEY-----'),
      'Token do GitHub': j('gh', 'p_', 'A'.repeat(36)),
      'Chave da AWS': j('AK', 'IA', 'ABCDEFGHIJKLMNOP'),
      'Chave secreta Stripe': j('sk_', 'live_', 'a'.repeat(24)),
      'Chave SendGrid': j('SG', '.', 'a'.repeat(22), '.', 'b'.repeat(43)),
      'Segredo OAuth da Google': j('GOC', 'SPX-', 'a'.repeat(28)),
      'Chave de API (sk-)': j('sk', '-', 'a'.repeat(40)),
    };
    for (const [rule, value] of Object.entries(samples)) {
      const hits = findSecrets(`const x = "${value}";`);
      expect(hits.map((h) => h.rule), rule).toContain(rule);
      expect(hits[0].preview).not.toContain(value);
    }
  });

  it('só trata um JWT como segredo se for service_role', () => {
    expect(findSecrets(jwt({ role: 'anon', iss: 'supabase' }))).toEqual([]);
    const hits = findSecrets(`\n\nKEY=${jwt({ role: 'service_role', iss: 'supabase' })}`);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ rule: 'JWT service_role do Supabase', line: 3 });
  });

  it('deixa passar o que é público por desenho', () => {
    const publicos = [
      j('AI', 'za', 'Sy', 'x'.repeat(33)),
      j('sb_', 'publishable_', 'apenas_para_testes'),
      'risk-assessment-and-something-long-enough-here',
      'task-1234567890abcdef1234567890abcdef',
    ];
    for (const value of publicos) expect(findSecrets(value), value).toEqual([]);
  });
});
