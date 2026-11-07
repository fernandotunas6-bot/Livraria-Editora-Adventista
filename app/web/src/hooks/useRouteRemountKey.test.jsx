import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRouteRemountKey } from './useRouteRemountKey';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Quando é que a página inteira é montada de novo (ver `useRouteRemountKey`).
 *
 * O caso que motivou isto: na loja, no telemóvel, o painel de filtros fechava-se sozinho
 * depois de cada toque. Marcar um filtro escreve-o no endereço com `replace`; a fronteira de
 * erros do `App.jsx` estava presa a `location.key`, que muda a cada navegação; a loja era
 * desmontada; o "painel aberto", que é estado da página, voltava a fechado.
 *
 * Aqui a "página" é um contador com um painel que abre: se for remontada, o painel fecha e
 * o contador de montagens sobe.
 */

let host;
let root;
let montagens;
let navegar;
let mudarParametros;

function Pagina() {
  const [aberto, setAberto] = useState(false);
  const [params, setParams] = useSearchParams();
  navegar = useNavigate();
  mudarParametros = setParams;
  React.useEffect(() => { montagens++; }, []);
  return (
    <div>
      <button type="button" onClick={() => setAberto(true)}>abrir</button>
      <span data-aberto={aberto ? 'sim' : 'nao'} data-filtro={params.get('f') || ''} />
    </div>
  );
}

/** O mesmo arranjo do `App.jsx`: a chave na fronteira que envolve as rotas. */
function Fronteira({ children }) {
  const chave = useRouteRemountKey();
  return <div key={chave}>{children}</div>;
}

beforeEach(async () => {
  montagens = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/shop']}>
      <Fronteira>
        <Routes>
          <Route path="/shop" element={<Pagina />} />
          <Route path="/outra" element={<Pagina />} />
        </Routes>
      </Fronteira>
    </MemoryRouter>,
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const abrirPainel = async () => {
  await act(async () => host.querySelector('button').click());
};
const painelAberto = () => host.querySelector('[data-aberto]').getAttribute('data-aberto') === 'sim';
const filtro = () => host.querySelector('[data-filtro]').getAttribute('data-filtro');

describe('useRouteRemountKey', () => {
  it('a página a reescrever o próprio endereço (replace) não a remonta', async () => {
    await abrirPainel();
    expect(montagens).toBe(1);
    await act(async () => mudarParametros({ f: 'saude' }, { replace: true }));
    expect(filtro()).toBe('saude');
    expect(painelAberto()).toBe(true);
    expect(montagens).toBe(1);
  });

  it('várias escritas seguidas também não', async () => {
    await abrirPainel();
    for (const f of ['a', 'b', 'c']) {
      await act(async () => mudarParametros({ f }, { replace: true }));
    }
    expect(filtro()).toBe('c');
    expect(painelAberto()).toBe(true);
    expect(montagens).toBe(1);
  });

  it('um link para o mesmo caminho com outros filtros remonta, como antes', async () => {
    // É o link do menu de `/shop?category=A` para `/shop?category=B`: a remontagem é o que
    // faz o `useProductFilters` ler os filtros novos do endereço.
    await abrirPainel();
    await act(async () => navegar('/shop?f=outra'));
    expect(filtro()).toBe('outra');
    expect(painelAberto()).toBe(false);
    expect(montagens).toBe(2);
  });

  it('mudar de página remonta, mesmo com replace', async () => {
    // Um `<Navigate replace>` para outro caminho, como `/loja` → `/shop`.
    await act(async () => navegar('/outra', { replace: true }));
    expect(montagens).toBe(2);
  });

  it('voltar atrás remonta, como antes', async () => {
    await act(async () => navegar('/shop?f=1'));
    expect(montagens).toBe(2);
    await act(async () => navegar(-1));
    expect(montagens).toBe(3);
  });

  it('depois de uma escrita com replace, um link volta a remontar', async () => {
    await act(async () => mudarParametros({ f: 'a' }, { replace: true }));
    expect(montagens).toBe(1);
    await act(async () => navegar('/shop?f=b'));
    expect(montagens).toBe(2);
  });
});
