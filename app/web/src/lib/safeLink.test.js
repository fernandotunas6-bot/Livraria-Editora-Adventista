// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { isInternalLink, safeLinkUrl } from './safeLink';

describe('safeLinkUrl', () => {
  it('deixa passar caminhos do próprio site', () => {
    expect(safeLinkUrl('/faq')).toBe('/faq');
    expect(safeLinkUrl('/profile?tab=orders')).toBe('/profile?tab=orders');
    expect(safeLinkUrl('/shop/saúde')).toBe('/shop/saúde');
    expect(safeLinkUrl('#contactos')).toBe('#contactos');
    expect(safeLinkUrl('?sort=newest')).toBe('?sort=newest');
    expect(safeLinkUrl('  /lojas  ')).toBe('/lojas');
  });

  it('deixa passar endereços web, email e telefone', () => {
    expect(safeLinkUrl('https://adventistas.org')).toBe('https://adventistas.org');
    expect(safeLinkUrl('http://exemplo.ao')).toBe('http://exemplo.ao');
    expect(safeLinkUrl('mailto:loja@exemplo.ao')).toBe('mailto:loja@exemplo.ao');
    expect(safeLinkUrl('tel:+244900000000')).toBe('tel:+244900000000');
  });

  it('recusa o que executa código, em qualquer forma', () => {
    // O React não remove um href destes: só escreve um aviso na consola.
    for (const mau of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)  ',
      'jAvAsCrIpT:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://exemplo.ao/abc',
    ]) {
      expect(safeLinkUrl(mau)).toBe('');
    }
  });

  it('recusa um endereço para fora disfarçado de caminho', () => {
    expect(safeLinkUrl('//evil.test')).toBe('');
    expect(safeLinkUrl('/\\evil.test')).toBe('');
    expect(safeLinkUrl('///evil.test')).toBe('');
  });

  it('recusa o que não é endereço nenhum', () => {
    expect(safeLinkUrl('')).toBe('');
    expect(safeLinkUrl(null)).toBe('');
    expect(safeLinkUrl(undefined)).toBe('');
    expect(safeLinkUrl('a definir')).toBe('');
    expect(safeLinkUrl({})).toBe('');
  });
});

describe('isInternalLink', () => {
  it('distingue o caminho do endereço para fora', () => {
    expect(isInternalLink('/faq')).toBe(true);
    expect(isInternalLink('#topo')).toBe(true);
    expect(isInternalLink('https://exemplo.ao')).toBe(false);
    expect(isInternalLink('mailto:x@y.ao')).toBe(false);
    // Um endereço recusado não é interno nem externo: não é link.
    expect(isInternalLink('javascript:alert(1)')).toBe(false);
    expect(isInternalLink('//evil.test')).toBe(false);
  });
});
