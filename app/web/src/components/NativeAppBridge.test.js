import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: {} }) }));
vi.mock('@/lib/pushNotifications', () => ({ sincronizarPushNativo: async () => false }));

const { caminhoDaNotificacao } = await import('./NativeAppBridge.jsx');

describe('caminhoDaNotificacao', () => {
  it('as páginas do site, pelo caminho ou pelo endereço inteiro', () => {
    expect(caminhoDaNotificacao('/profile?tab=orders')).toBe('/profile?tab=orders');
    expect(caminhoDaNotificacao('https://livrariaadventista.ao/novidades')).toBe('/novidades');
  });

  it('nada de fora do site', () => {
    expect(caminhoDaNotificacao('//exemplo.com/x')).toBeNull();
    expect(caminhoDaNotificacao('https://exemplo.com/x')).toBeNull();
    expect(caminhoDaNotificacao('')).toBeNull();
    expect(caminhoDaNotificacao(undefined)).toBeNull();
  });
});
