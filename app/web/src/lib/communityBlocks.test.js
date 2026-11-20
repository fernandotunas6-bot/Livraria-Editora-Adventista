// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it, vi } from 'vitest';

// Bloquear na comunidade (regra 1.2 da App Store): a lista da conta, guardada no servidor.

const linhas = [];
const chamadas = [];
let erroAoInserir = null;
let erroAoLer = null;
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (tabela) => ({
      select: () => ({
        order: async () => { chamadas.push(['ler', tabela]); return erroAoLer ? { data: null, error: erroAoLer } : { data: [...linhas], error: null }; },
      }),
      insert: async (linha) => { chamadas.push(['inserir', linha]); return { error: erroAoInserir }; },
      delete: () => ({ eq: async (coluna, valor) => { chamadas.push(['apagar', coluna, valor]); return { error: null }; } }),
    }),
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({}) }));

const { _reporBloqueios, bloquearPessoa, carregarBloqueios, desbloquearPessoa } = await import('./communityBlocks');
const { useBloqueios } = await import('./communityBlocks');

afterEach(() => {
  _reporBloqueios();
  linhas.length = 0;
  chamadas.length = 0;
  erroAoInserir = null;
  erroAoLer = null;
});

describe('bloquear na comunidade', () => {
  it('carrega a lista da conta uma vez, mesmo com muitos cartões a pedir', async () => {
    linhas.push({ blocked_key: 'k1', blocked_name: 'Ana', created: '2026-11-17T10:00:00Z' });
    await Promise.all([carregarBloqueios('u1'), carregarBloqueios('u1'), carregarBloqueios('u1')]);
    await carregarBloqueios('u1');
    expect(chamadas.filter(([o]) => o === 'ler')).toHaveLength(1);
  });

  it('bloquear guarda a chave e o nome; outra vez não repete', async () => {
    await carregarBloqueios('u1');
    expect(await bloquearPessoa('u1', 'k2', '  Bruno  ')).toBe('');
    expect(chamadas).toContainEqual(['inserir', { blocked_key: 'k2', blocked_name: 'Bruno' }]);
    expect(await bloquearPessoa('u1', 'k2', 'Bruno')).toBe('');
    expect(chamadas.filter(([o]) => o === 'inserir')).toHaveLength(1);
  });

  it('já bloqueada noutro aparelho conta como bloqueada', async () => {
    await carregarBloqueios('u1');
    erroAoInserir = { code: '23505', message: 'duplicate key' };
    expect(await bloquearPessoa('u1', 'k3', 'Carla')).toBe('');
  });

  it('se o servidor recusar, a pessoa volta a aparecer e diz-se porquê', async () => {
    await carregarBloqueios('u1');
    erroAoInserir = { code: '42501', message: 'denied' };
    expect(await bloquearPessoa('u1', 'k4', 'Duarte')).toMatch(/Não foi possível bloquear/);
    expect(await desbloquearPessoa('u1', 'k4')).toBe('');
  });

  it('sem conta não se bloqueia ninguém', async () => {
    expect(await bloquearPessoa('', 'k1', 'Ana')).toMatch(/Entre na sua conta/);
    expect(chamadas).toEqual([]);
  });

  it('sem a tabela (migração por aplicar) ninguém fica bloqueado e nada parte', async () => {
    erroAoLer = { code: 'PGRST205', message: "Could not find the table 'public.community_blocks'" };
    await expect(carregarBloqueios('u1')).resolves.toBeUndefined();
  });

  it('desbloquear apaga a chave da conta', async () => {
    linhas.push({ blocked_key: 'k5', blocked_name: 'Eva', created: '2026-11-17T10:00:00Z' });
    await carregarBloqueios('u1');
    expect(await desbloquearPessoa('u1', 'k5')).toBe('');
    expect(chamadas).toContainEqual(['apagar', 'blocked_key', 'k5']);
  });

  it('o hook existe para os componentes', () => {
    expect(typeof useBloqueios).toBe('function');
  });
});
