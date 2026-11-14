import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { privacySections } from '@/lib/privacyPolicy';
import { ACCOUNT_VIEWS } from '@/lib/siteAreas';
import { termsSections } from '@/lib/termsPolicy';

const flat = (sections) => sections.flatMap((s) => s.blocks.flatMap((b) => b.list || [b.p])).join('\n');
const section = (id) => flat(termsSections().filter((s) => s.id === id));
const links = (text) => [...text.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);

describe('termsSections', () => {
  it('usa os contactos das Configurações', () => {
    const text = flat(termsSections({ contact_email: 'geral@exemplo.ao', contact_phone: '+244 900 000 000', site_name: 'Livraria X' }));
    expect(text).toMatch(/pelo email geral@exemplo\.ao/);
    expect(text).toMatch(/pelo telefone \+244 900 000 000/);
    expect(text).toMatch(/site da Livraria X/);
  });

  it('sem contactos configurados, aponta para a página de contacto', () => {
    const text = flat(termsSections({}));
    expect(text).not.toMatch(/pelo email \S+@/);
    expect(text).toMatch(/\[Falar connosco\]\(\/contact\)/);
  });

  it('diz que quem comprou sem conta também cancela sozinho, em Rastrear encomenda', () => {
    expect(section('encomendas')).toMatch(/sem conta, em \[Rastrear encomenda\]\(\/track\)/);
    expect(section('encomendas')).not.toMatch(/comprou sem conta, tratamos/);
  });

  it('não exige no levantamento um documento que o sistema não pede', () => {
    expect(section('entrega')).not.toMatch(/traga .*documento/);
  });

  it('mostra a morada só quando está nas Configurações', () => {
    expect(flat(termsSections({ contact_address: 'Rua X, Huambo' }))).toMatch(/Morada: Rua X, Huambo\./);
    expect(flat(termsSections({}))).not.toMatch(/Morada:/);
  });

  it('diz que o cliente não confirma o pagamento (docs/PAGAMENTOS.md)', () => {
    expect(section('pagamentos')).toMatch(/só fica confirmado pelo serviço de pagamentos ou pela nossa equipa/);
    expect(section('pagamentos')).toMatch(/não confirma o pagamento/);
  });

  it('diz que o colportor não cobra a encomenda que entrega (docs/COLPORTAGEM.md)', () => {
    expect(section('entrega')).toMatch(/colportor que lhe leva uma encomenda não cobra/);
  });

  it('as edições digitais têm regras próprias e o prazo de 30 dias fica nos impressos', () => {
    expect(section('digital')).toMatch(/quando a encomenda inteira estiver paga/);
    expect(section('digital')).toMatch(/fecha com o reembolso total/);
    expect(termsSections().find((s) => s.id === 'devolucoes').title).toMatch(/impressos/);
    expect(flat(termsSections())).not.toMatch(/não vendemos produtos digitais/i);
  });

  it('cada secção tem identificador único e as ligações internas existem', () => {
    const sections = termsSections();
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);

    const app = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8');
    const anchors = new Set(privacySections().map((s) => s.id));
    for (const href of links(flat(sections))) {
      const [path, anchor] = href.split('#');
      expect(app, href).toContain(`path="${path.split('?')[0]}"`);
      if (anchor) expect(anchors.has(anchor), href).toBe(true);
    }
  });

  it('os separadores do perfil citados existem', () => {
    const tabs = new Set(ACCOUNT_VIEWS.map((a) => a.id));
    const cited = links(flat(termsSections())).filter((l) => l.startsWith('/profile?tab=')).map((l) => l.split('=')[1]);
    expect(cited.length).toBeGreaterThan(0);
    for (const tab of cited) expect(tabs.has(tab), tab).toBe(true);
  });
});
