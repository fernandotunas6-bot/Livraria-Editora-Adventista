import { describe, expect, it } from 'vitest';
import {
  fromLocalInput, noticeFormError, noticeKey, noticeLinkKind, noticeStatus, noticeTone, pickNotice, sortNotices, toLocalInput,
} from './siteNotices';

const NOW = new Date('2026-11-10T12:00:00Z').getTime();
const n = (id, extra = {}) => ({ id, message: `Aviso ${id}`, tone: 'info', active: true, dismissible: true, created: '2026-11-01T00:00:00Z', ...extra });

describe('faixa de aviso', () => {
  it('diz o estado pelas datas', () => {
    expect(noticeStatus(n('a'), NOW)).toBe('live');
    expect(noticeStatus(n('a', { active: false }), NOW)).toBe('off');
    expect(noticeStatus(n('a', { starts_at: '2026-11-11T00:00:00Z' }), NOW)).toBe('scheduled');
    expect(noticeStatus(n('a', { ends_at: '2026-11-10T12:00:00Z' }), NOW)).toBe('ended');
    expect(noticeStatus(n('a', { starts_at: '2026-11-09T00:00:00Z', ends_at: '2026-11-12T00:00:00Z' }), NOW)).toBe('live');
  });

  it('ordena: urgente, promoção, informação; no mesmo tom, o mais recente', () => {
    const list = [
      n('info'),
      n('promo', { tone: 'promo' }),
      n('urg-velho', { tone: 'urgent', starts_at: '2026-11-01T00:00:00Z' }),
      n('urg-novo', { tone: 'urgent', starts_at: '2026-11-09T00:00:00Z' }),
    ];
    expect(sortNotices(list).map((x) => x.id)).toEqual(['urg-novo', 'urg-velho', 'promo', 'info']);
  });

  it('escolhe o primeiro no ar e passa ao seguinte quando o visitante fecha', () => {
    const list = [n('info'), n('urg', { tone: 'urgent' }), n('futuro', { tone: 'urgent', starts_at: '2026-12-01T00:00:00Z' })];
    expect(pickNotice(list, { now: NOW }).id).toBe('urg');
    expect(pickNotice(list, { now: NOW, dismissed: [noticeKey(list[1])] }).id).toBe('info');
    expect(pickNotice(list, { now: NOW, dismissed: list.map(noticeKey) })).toBeNull();
    expect(pickNotice([], { now: NOW })).toBeNull();
  });

  it('um aviso que não se deixa fechar fica mesmo com a chave guardada', () => {
    const fixo = n('fixo', { dismissible: false });
    expect(pickNotice([fixo], { now: NOW, dismissed: [noticeKey(fixo)] }).id).toBe('fixo');
  });

  it('volta a mostrar o aviso fechado se o texto mudar', () => {
    const a = n('a');
    expect(noticeKey(a)).toBe(noticeKey({ ...a, ends_at: '2026-12-01T00:00:00Z' }));
    expect(noticeKey(a)).not.toBe(noticeKey({ ...a, message: 'Outro texto' }));
    expect(noticeKey(a)).not.toBe(noticeKey({ ...a, link_url: '/materiais' }));
  });

  it('aceita os mesmos links que a base de dados', () => {
    expect(noticeLinkKind('/materiais')).toBe('internal');
    expect(noticeLinkKind('/')).toBe('internal');
    expect(noticeLinkKind('https://exemplo.ao/x?y=1')).toBe('external');
    for (const bad of ['//evil.com', '/\\evil.com', 'javascript:alert(1)', 'https://user@evil.com', 'materiais', 'https://a b.com', '/a"b']) {
      expect(noticeLinkKind(bad)).toBe('');
    }
  });

  it('valida o formulário do painel', () => {
    expect(noticeFormError({ message: '' })).toMatch(/Escreva/);
    expect(noticeFormError({ message: 'x'.repeat(201) })).toMatch(/200/);
    expect(noticeFormError({ message: 'Olá', link_url: 'javascript:alert(1)' })).toMatch(/link/);
    expect(noticeFormError({ message: 'Olá', starts_at: '2026-11-10T10:00', ends_at: '2026-11-10T09:00' })).toMatch(/fim/);
    expect(noticeFormError({ message: 'Olá', link_url: '/materiais', link_label: 'Ver' })).toBe('');
  });

  it('converte entre ISO e o campo de data e hora', () => {
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBeNull();
    const iso = fromLocalInput('2026-11-11T08:30');
    expect(toLocalInput(iso)).toBe('2026-11-11T08:30');
  });

  it('tem tom por omissão', () => {
    expect(noticeTone('x').value).toBe('info');
    expect(noticeTone('urgent').className).toMatch(/amber/);
  });
});
