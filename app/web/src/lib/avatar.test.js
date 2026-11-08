import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({
  mediaUrl: (table, id, file) => `https://x.supabase.co/storage/v1/object/public/media/${table}/${id}/${encodeURIComponent(file)}`,
}));
const { avatarSrc } = await import('./avatar');

describe('avatarSrc', () => {
  it('ficheiro enviado pela pessoa: endereço do bucket', () => {
    expect(avatarSrc('u1', 'foto.jpg')).toBe('https://x.supabase.co/storage/v1/object/public/media/users/u1/foto.jpg');
  });

  it('foto da conta Google: usa-se tal como está (era isto que saía partido)', () => {
    const google = 'https://lh3.googleusercontent.com/a/ACg8ocKNX=s96-c';
    expect(avatarSrc('u1', google)).toBe(google);
  });

  it('endereços de outros servidores não entram', () => {
    expect(avatarSrc('u1', 'https://exemplo.com/pixel.gif')).toBe('');
    expect(avatarSrc('u1', 'http://lh3.googleusercontent.com/a/x')).toBe('');
    expect(avatarSrc('u1', 'https://googleusercontent.com.exemplo.com/a')).toBe('');
    expect(avatarSrc('u1', '//exemplo.com/a.png')).toBe('');
    expect(avatarSrc('u1', 'javascript:alert(1)')).toBe('');
    expect(avatarSrc('u1', 'data:image/svg+xml,<svg/>')).toBe('');
  });

  it('sem foto, ou sem id para um ficheiro: vazio (mostram-se as iniciais)', () => {
    expect(avatarSrc('u1', '')).toBe('');
    expect(avatarSrc('u1', null)).toBe('');
    expect(avatarSrc('', 'foto.jpg')).toBe('');
  });
});
