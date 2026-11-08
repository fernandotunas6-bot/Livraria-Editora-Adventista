import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
vi.mock('@/lib/dataClient', () => ({ default: { send: vi.fn() } }));

const {
  SEEN_KEY, hasUnseenRelease, isMissingTable, listPublishedReleases, markReleasesSeen, noteLines, readSeenReleases,
  releaseDraft, releaseStatus,
} = await import('@/lib/appReleases');

afterEach(() => {
  localStorage.clear();
  rpc.mockReset();
});

describe('noteLines', () => {
  it('uma novidade por linha, sem os marcadores que as pessoas escrevem', () => {
    expect(noteLines('- Entra sozinho\n\n• Aviso de versão\n* Conta lembrada\n1. Push\n  2) Novidades  ')).toEqual([
      'Entra sozinho', 'Aviso de versão', 'Conta lembrada', 'Push', 'Novidades',
    ]);
    expect(noteLines('')).toEqual([]);
    expect(noteLines(null)).toEqual([]);
  });

  it('não corta números que fazem parte do texto', () => {
    expect(noteLines('2026 traz novidades')).toEqual(['2026 traz novidades']);
  });
});

describe('novidades vistas', () => {
  it('uma novidade publicada depois da última vista é nova', () => {
    const latest = { published_at: '2026-11-08T10:00:00Z' };
    expect(hasUnseenRelease(latest, '2026-11-01T10:00:00Z')).toBe(true);
    expect(hasUnseenRelease(latest, '2026-11-08T10:00:00Z')).toBe(false);
    expect(hasUnseenRelease(null, '')).toBe(false);
  });

  it('a marca só avança: ver uma antiga não faz as recentes parecerem novas', () => {
    markReleasesSeen('2026-11-08T10:00:00Z');
    markReleasesSeen('2026-11-01T10:00:00Z');
    expect(readSeenReleases()).toBe('2026-11-08T10:00:00Z');
    markReleasesSeen('2026-11-09T10:00:00Z');
    expect(localStorage.getItem(SEEN_KEY)).toBe('2026-11-09T10:00:00Z');
  });
});

describe('releaseStatus', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  it('do rascunho ao envio por push', () => {
    expect(releaseStatus({}, now).key).toBe('draft');
    expect(releaseStatus({ published_at: '2026-11-09T00:00:00Z' }, now).key).toBe('scheduled');
    expect(releaseStatus({ published_at: '2026-11-08T00:00:00Z' }, now).key).toBe('published');
    expect(releaseStatus({ published_at: '2026-11-08T00:00:00Z', push_requested_at: '2026-11-08T01:00:00Z', push_sent: 40 }, now))
      .toEqual({ key: 'sending', label: 'A avisar (40 enviados)' });
    expect(releaseStatus({ published_at: 'x', push_requested_at: 'y', push_finished_at: 'z', push_sent: 812 }, now).label)
      .toBe('Avisada por push (812 aparelhos)');
  });
});

describe('releaseDraft', () => {
  it('limpa e aceita', () => {
    expect(releaseDraft({ title: '  Entrar   mais rápido ', notes: 'a\r\nb ', version: ' 2026.11.08-ab12cd3 ' }))
      .toEqual({ data: { title: 'Entrar mais rápido', notes: 'a\nb', version: '2026.11.08-ab12cd3' } });
  });

  it('as mesmas regras da base de dados', () => {
    expect(releaseDraft({ title: 'Oi' }).error).toMatch(/3 letras/);
    expect(releaseDraft({ title: 'x'.repeat(91) }).error).toMatch(/90/);
    expect(releaseDraft({ title: 'Versão nova', notes: 'x'.repeat(2001) }).error).toMatch(/2000/);
    expect(releaseDraft({ title: 'Versão nova', version: 'v1; drop' }).error).toMatch(/letras, números/);
  });
});

describe('listPublishedReleases', () => {
  it('lê pela função pública', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'r1', title: 'Novidades' }], error: null });
    expect(await listPublishedReleases(5)).toEqual([{ id: 'r1', title: 'Novidades' }]);
    expect(rpc).toHaveBeenCalledWith('app_releases_published', { p_limit: 5 });
  });

  it('sem a migração (função por criar) ou sem rede: vazio, sem erro', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await listPublishedReleases()).toEqual([]);
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await listPublishedReleases()).toEqual([]);
  });

  it('isMissingTable reconhece a falta da tabela ou da função', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true);
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.app_releases'" })).toBe(true);
    expect(isMissingTable({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
