import { describe, expect, it } from 'vitest';
import { inlineParts, privacyContacts, privacySections } from '@/lib/privacyPolicy';

const flat = (sections) => sections.flatMap((s) => s.blocks.flatMap((b) => b.list || [b.p])).join('\n');

describe('privacySections', () => {
  it('tem uma secção da comunidade com o que é público e o que nunca é', () => {
    const community = privacySections().find((s) => s.id === 'comunidade');
    const text = community.blocks.flatMap((b) => b.list || [b.p]).join('\n');
    expect(text).toMatch(/nome do seu perfil/);
    expect(text).toMatch(/perfil de leitor/);
    expect(text).toMatch(/Nunca é mostrado:\*\* o email, o telefone, a fotografia/);
    expect(text).toMatch(/\/profile\?tab=notifications/);
    expect(text).toMatch(/publicações, respostas e gostos são apagados com ela/);
  });

  it('usa os contactos das Configurações', () => {
    const text = flat(privacySections({ contact_email: 'geral@exemplo.ao', contact_phone: '+244 900 000 000', site_name: 'Livraria X' }));
    expect(text).toMatch(/pelo email geral@exemplo\.ao/);
    expect(text).toMatch(/pelo telefone \+244 900 000 000/);
    expect(text).toMatch(/a Livraria X trata/);
  });

  it('sem contactos configurados, aponta para a página de contacto', () => {
    const text = flat(privacySections({}));
    expect(text).not.toMatch(/pelo email \S+@/);
    expect(text).toMatch(/\[Falar connosco\]\(\/contact\)/);
  });

  it('a colportagem diz o que o colportor nunca vê e para que serve a candidatura', () => {
    const colp = privacySections().find((s) => s.id === 'colportagem');
    const text = colp.blocks.flatMap((b) => b.list || [b.p]).join('\n');
    expect(text).toMatch(/nunca o seu nome, email, telefone ou morada/);
    expect(text).toMatch(/pastor do distrito para confirmar a recomendação/);
    expect(text).toMatch(/\/colportor\/candidatura/);
  });

  it('ids únicos para os links da página', () => {
    const ids = privacySections().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('privacyContacts', () => {
  it('limpa espaços e tem nome por omissão', () => {
    expect(privacyContacts({ contact_email: '  a@b.ao ' })).toMatchObject({ email: 'a@b.ao', phone: '', name: 'Livraria Adventista' });
  });
});

describe('inlineParts', () => {
  it('negrito e links internos', () => {
    expect(inlineParts('Veja **isto** em [Perfil](/profile?tab=settings).')).toEqual([
      { text: 'Veja ' }, { text: 'isto', bold: true }, { text: ' em ' }, { text: 'Perfil', href: '/profile?tab=settings' }, { text: '.' },
    ]);
  });
  it('links para fora ficam texto', () => {
    expect(inlineParts('[mau](//evil.example)')).toEqual([{ text: 'mau' }]);
    expect(inlineParts('[mau](https://evil.example)')).toEqual([{ text: '[mau](https://evil.example)' }]);
  });
});
