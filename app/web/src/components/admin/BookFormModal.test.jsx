import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// O jsdom não tem `ResizeObserver`, e o Radix (interruptores e selectores) chama-o sem
// guarda. O código da casa guarda-o (`typeof ResizeObserver === 'function'`); isto é só para
// as bibliotecas. Como nos outros testes, fica aqui e não num arranque global.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

/**
 * O formulário de livros do painel, montado a sério.
 *
 * Porquê um teste destes: a auditoria 9.1 encontrou este formulário **partido em produção** —
 * `autoCode` tinha deixado de existir numa limpeza anterior, e como o `||` avaliava a
 * variável, criar ou duplicar um livro rebentava o render. Nada apanhou isso: o lint estava
 * com as regras desligadas e não havia teste que montasse o componente. O gate de qualidade
 * foi corrigido, mas continuava a não haver nada que abrisse este formulário.
 *
 * O teste não verifica o aspecto: verifica que o formulário **abre** nos três caminhos que o
 * painel usa (criar, editar, duplicar), que percorre os separadores sem rebentar, e que o
 * que sai no `onSave` é o que lá foi escrito.
 */

vi.mock('@/lib/dataClient', () => ({
  default: { collection: () => ({ getFullList: async () => [] }), files: { getURL: () => '' } },
}));
vi.mock('@/hooks/useIntegrations', () => ({ useIntegrations: () => ({ driveImageConfig: null }) }));
// Dois filhos pesados que têm os seus próprios testes e trazem dependências de rede.
vi.mock('@/components/admin/ImageField', () => ({
  default: ({ label }) => <div data-testid="campo-imagem">{label}</div>,
}));
vi.mock('@/components/admin/StockHistory', () => ({ default: () => <div /> }));
vi.mock('@/components/admin/RichTextEditor', () => ({
  default: ({ value, onChange }) => (
    <textarea aria-label="editor" value={value || ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const { default: BookFormModal } = await import('./BookFormModal');

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

const montar = async (props = {}) => {
  await act(async () => root.render(
    <BookFormModal open onClose={() => {}} onSave={() => {}} saving={false} {...props} />,
  ));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

const livro = (extra = {}) => ({
  id: 'rec1', title: 'O Grande Conflito', author: 'Ellen G. White', genre: 'Catálogo Geral',
  price: 3500, stock: 5, cover: '', description: '<p>x</p>', featured: false,
  book_code: 'LIV-001', sku: 'LIV-001', product_type: 'livro', versions: [], sample_pages: [],
  active: true, sales_count: 3, views_count: 40, ...extra,
});

const separadores = () => [...host.querySelectorAll('[role="tab"]')];
const campoVideo = () => host.querySelector('#campo-video');

/**
 * Abre um separador. Um `click()` não chega: os separadores do Radix mudam no `mousedown`,
 * e com só o `click` o teste passava sem nunca mudar de painel.
 */
const abrirSeparador = async (nome) => {
  const alvo = separadores().find((t) => t.textContent.includes(nome));
  if (!alvo) throw new Error(`separador "${nome}" não encontrado`);
  await act(async () => {
    alvo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    alvo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return alvo;
};

describe('BookFormModal', () => {
  it('abre para criar um livro novo', async () => {
    await montar();
    expect(host.textContent).toContain('Publicar Livro');
    expect(separadores().length).toBeGreaterThan(3);
  });

  it('abre para editar e traz os valores do livro', async () => {
    await montar({ editing: livro() });
    expect(host.textContent).toContain('Guardar Alterações');
    expect(host.querySelector('input[value="O Grande Conflito"]')).not.toBeNull();
  });

  it('abre para duplicar, com o título marcado e sem os códigos únicos', async () => {
    // É o caminho que estava partido em produção (achado 18).
    await montar({ template: livro() });
    expect(host.querySelector('input[value="O Grande Conflito (cópia)"]')).not.toBeNull();
  });

  it('percorre todos os separadores sem rebentar, e cada um abre mesmo', async () => {
    await montar({ editing: livro() });
    const nomes = separadores().map((s) => s.textContent);
    expect(nomes.length).toBeGreaterThan(5);
    for (const nome of nomes) {
      const aberto = await abrirSeparador(nome);
      expect(aberto.getAttribute('data-state')).toBe('active');
    }
  });

  it('o campo de vídeo só aceita YouTube, e avisa quando não é', async () => {
    await montar({ editing: livro() });
    await abrirSeparador('Mídia');

    const campo = campoVideo();
    expect(campo).not.toBeNull();
    expect(campo.getAttribute('aria-invalid')).toBeNull();

    const escrever = async (valor) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      await act(async () => {
        setter.call(campoVideo(), valor);
        campoVideo().dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    };

    await escrever('https://vimeo.com/123');
    expect(campoVideo().getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Não parece um endereço do YouTube');

    await escrever('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(campoVideo().getAttribute('aria-invalid')).toBeNull();
    // Com um endereço válido mostra a pré-visualização, com a moldura ainda por carregar.
    expect(host.textContent).toContain('Como fica na ficha');
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('o que sai no onSave é o que lá está, com o vídeo incluído', async () => {
    const onSave = vi.fn();
    await montar({ editing: livro({ video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }), onSave });
    const submeter = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Guardar Alterações'));
    await act(async () => submeter.click());
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.title).toBe('O Grande Conflito');
    expect(payload.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(payload.product_type).toBe('livro');
    expect(payload.price).toBe(3500);
  });

  it('um produto que não é livro não mostra os separadores próprios de livros', async () => {
    await montar({ editing: livro({ product_type: 'vestuario', genre: 'T-shirts e vestuário' }) });
    const nomes = separadores().map((s) => s.textContent);
    expect(nomes.some((n) => n.includes('Preview'))).toBe(false);
    // E as variantes chamam-se tamanhos, não versões.
    expect(nomes.some((n) => n.includes('Tamanhos'))).toBe(true);
  });

  it('fechado, não desenha nada', async () => {
    await act(async () => root.render(<BookFormModal open={false} onClose={() => {}} onSave={() => {}} />));
    expect(host.textContent).toBe('');
  });
});
