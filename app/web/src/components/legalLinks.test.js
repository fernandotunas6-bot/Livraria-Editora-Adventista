// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file) => readFileSync(resolve(__dirname, file), 'utf8');

describe('ligações legais', () => {
  it.each([
    'Footer.jsx',
    'FooterCompact.jsx',
    'MobileCategoriesSheet.jsx',
    'Header.jsx',
    'auth/AuthForm.jsx',
    // O painel do carrinho mudou de ficheiro: o ShoppingCart.jsx passou a ser a casca que o
    // carrega em lazy, e o aviso vive no painel.
    'ShoppingCartPanel.jsx',
    '../pages/ShippingReturnsPage.jsx',
  ])('%s liga aos termos', (file) => {
    // MobileCategoriesSheet tem as ligações numa lista: ['/termos', 'Termos e condições'].
    expect(source(file)).toMatch(/(to|href)="\/termos"|\['\/termos',/);
  });

  it('o aviso do checkout aparece em todos os ecrãs e abre noutro separador', () => {
    const aviso = source('ShoppingCartPanel.jsx').match(/<p className="([^"]*)">\s*Ao confirmar, aceita os/);
    expect(aviso).not.toBeNull();
    expect(aviso[1]).not.toMatch(/hidden/);
    expect(source('ShoppingCartPanel.jsx')).toMatch(/href="\/termos" target="_blank"/);
  });
});

describe('newsletter', () => {
  it('não promete a oferta que o servidor nunca enviou', () => {
    const footer = source('Footer.jsx');
    expect(footer).not.toMatch(/cupão|-10%|10% de desconto|Premium|devocionais semanais/);
  });
});
