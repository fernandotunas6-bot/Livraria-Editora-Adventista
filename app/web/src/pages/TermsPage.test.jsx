// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

vi.mock('@/components/Header.jsx', () => ({ default: () => null }));
vi.mock('@/components/Footer.jsx', () => ({ default: () => null }));
vi.mock('@/components/ShoppingCart.jsx', () => ({ default: () => null }));
vi.mock('@/components/PageBannerSlider', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));
vi.mock('@/hooks/useSiteSettings', () => ({
  useSiteSettings: () => ({ settings: { site_name: 'Livraria X', contact_email: 'geral@exemplo.ao' } }),
}));

const { default: TermsPage } = await import('@/pages/TermsPage');
const { default: PrivacyPage } = await import('@/pages/PrivacyPage');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;

async function render(page, entry = '/') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[entry]}>{page}</MemoryRouter>);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

describe('páginas legais', () => {
  it('os termos mostram título, data, índice e os contactos das Configurações', async () => {
    await render(<TermsPage />);
    expect(host.querySelector('h1').textContent).toBe('Termos e condições');
    expect(host.textContent).toMatch(/Última actualização: 17 de Novembro de 2026/);
    expect(host.querySelector('nav a[href="#pagamentos"]')).not.toBeNull();
    expect(host.querySelector('section#pagamentos h2')).not.toBeNull();
    expect(host.textContent).toMatch(/pelo email geral@exemplo\.ao/);
    // No telemóvel, o índice começa recolhido, para o texto aparecer logo.
    expect(host.querySelector('details.lg\\:hidden').open).toBe(false);
  });

  it('as ligações do texto são ligações a sério, e o negrito não mostra asteriscos', async () => {
    await render(<TermsPage />);
    expect(host.querySelector('article a[href="/privacidade#colportagem"]')).not.toBeNull();
    expect(host.querySelector('article a[href="/track"]')).not.toBeNull();
    expect(host.querySelector('article').textContent).not.toMatch(/\*\*|\]\(/);
  });

  it('a privacidade continua igual depois de passar para o componente partilhado', async () => {
    await render(<PrivacyPage />);
    expect(host.querySelector('h1').textContent).toBe('Política de privacidade');
    expect(host.querySelector('section#comunidade h2')).not.toBeNull();
    expect(host.querySelector('nav a[href="#comunidade"]')).not.toBeNull();
  });

  it('abre na secção do endereço (/privacidade#comunidade)', async () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await render(<PrivacyPage />, '/privacidade#comunidade');
    act(() => { vi.advanceTimersByTime(200); });
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });
});
