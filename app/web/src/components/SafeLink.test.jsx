import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SafeLink from './SafeLink.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = async (no) => { await act(async () => root.render(<MemoryRouter>{no}</MemoryRouter>)); };
const hrefs = () => [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));

/**
 * Estes dois casos não testam o nosso código: testam as bibliotecas, e são a razão de o
 * `SafeLink` existir. Se um dia o React ou o Router passarem a filtrar isto sozinhos, estes
 * testes falham e dizem-no — e aí o `SafeLink` pode encolher.
 */
describe('o que as bibliotecas deixam passar (o porquê do SafeLink)', () => {
  it('o React rende um href `javascript:` sem o tocar', async () => {
    await render(<a href="javascript:alert(1)">x</a>);
    expect(hrefs()).toEqual(['javascript:alert(1)']);
  });

  it('o React Router passa `javascript:`, `data:` e `//outro-site` intactos', async () => {
    const alvos = ['javascript:alert(1)', 'data:text/html,x', '//evil.test/x'];
    await render(<>{alvos.map((t) => <Link key={t} to={t}>x</Link>)}</>);
    expect(hrefs()).toEqual(alvos);
  });
});

describe('SafeLink', () => {
  it('um caminho do site vira um link interno', async () => {
    await render(<SafeLink to="/profile?tab=orders">Conta</SafeLink>);
    const a = host.querySelector('a');
    expect(a.getAttribute('href')).toBe('/profile?tab=orders');
    expect(a.getAttribute('target')).toBeNull();
  });

  it('um endereço de fora abre noutro separador, com `rel` seguro', async () => {
    await render(<SafeLink to="https://adventistas.org">Site</SafeLink>);
    const a = host.querySelector('a');
    expect(a.getAttribute('href')).toBe('https://adventistas.org');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('decide interno ou externo pelo endereço, não por uma etiqueta ao lado', async () => {
    // Era o que o rodapé fazia: `internal: true` com um `https://…` ia para o <Link>.
    await render(<SafeLink to="https://exemplo.ao">x</SafeLink>);
    expect(host.querySelector('a').getAttribute('target')).toBe('_blank');
  });

  it('o que é perigoso não vira link nenhum — fica o texto', async () => {
    for (const mau of ['javascript:alert(1)', 'data:text/html,x', '//evil.test/x', 'blob:https://x/y', '']) {
      await render(<SafeLink to={mau}>Texto</SafeLink>);
      expect(hrefs()).toEqual([]);
      expect(host.textContent).toBe('Texto');
    }
  });

  it('mailto e tel passam', async () => {
    await render(<><SafeLink to="mailto:loja@exemplo.ao">E</SafeLink><SafeLink to="tel:+244900000000">T</SafeLink></>);
    expect(hrefs()).toEqual(['mailto:loja@exemplo.ao', 'tel:+244900000000']);
  });

  it('usa a classe alternativa quando recusa o endereço', async () => {
    await render(<SafeLink to="javascript:x" className="normal" fallbackClassName="apagado">T</SafeLink>);
    expect(host.querySelector('span').className).toBe('apagado');
  });
});
