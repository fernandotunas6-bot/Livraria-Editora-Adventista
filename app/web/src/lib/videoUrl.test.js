// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { embedOnlyVideoPlatform, playableVideoUrl } from './videoUrl';

describe('embedOnlyVideoPlatform', () => {
  it('reconhece as plataformas que um `<video src>` não consegue tocar', () => {
    expect(embedOnlyVideoPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('YouTube');
    expect(embedOnlyVideoPlatform('https://youtu.be/dQw4w9WgXcQ')).toBe('YouTube');
    expect(embedOnlyVideoPlatform('https://www.youtube-nocookie.com/embed/x')).toBe('YouTube');
    expect(embedOnlyVideoPlatform('https://vimeo.com/123456')).toBe('Vimeo');
    expect(embedOnlyVideoPlatform('https://player.vimeo.com/video/123')).toBe('Vimeo');
    expect(embedOnlyVideoPlatform('https://drive.google.com/file/d/abc/view')).toBe('Google Drive');
    expect(embedOnlyVideoPlatform('https://www.tiktok.com/@x/video/1')).toBe('TikTok');
  });

  it('deixa passar um ficheiro de vídeo a sério', () => {
    expect(embedOnlyVideoPlatform('https://cdn.exemplo.ao/hero.mp4')).toBe('');
    expect(embedOnlyVideoPlatform('https://projecto.supabase.co/storage/v1/object/public/media/x.webm')).toBe('');
    // Um CDN pode servir sem extensão no endereço: não se recusa por isso.
    expect(embedOnlyVideoPlatform('https://cdn.exemplo.ao/stream/abc123')).toBe('');
    expect(embedOnlyVideoPlatform('')).toBe('');
    expect(embedOnlyVideoPlatform(null)).toBe('');
  });

  it('um domínio que só *contém* o nome da plataforma não conta', () => {
    expect(embedOnlyVideoPlatform('https://youtube.com.exemplo.ao/x.mp4')).toBe('');
    expect(embedOnlyVideoPlatform('https://meu-youtube.ao/x.mp4')).toBe('');
  });
});

describe('playableVideoUrl', () => {
  it('devolve o endereço quando serve', () => {
    expect(playableVideoUrl('https://cdn.exemplo.ao/hero.mp4')).toBe('https://cdn.exemplo.ao/hero.mp4');
    expect(playableVideoUrl('/videos/hero.webm')).toBe('/videos/hero.webm');
    expect(playableVideoUrl('  https://cdn.exemplo.ao/a.mp4  ')).toBe('https://cdn.exemplo.ao/a.mp4');
  });

  it('vazio para as plataformas — é o que faz o fundo cair na imagem', () => {
    expect(playableVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('');
    expect(playableVideoUrl('https://vimeo.com/1')).toBe('');
  });

  it('vazio para esquemas que não servem num `src` de vídeo', () => {
    expect(playableVideoUrl('javascript:alert(1)')).toBe('');
    expect(playableVideoUrl('data:video/mp4;base64,AAAA')).toBe('');
    expect(playableVideoUrl('blob:https://x/y')).toBe('');
    expect(playableVideoUrl('//outro-site/x.mp4')).toBe('');
    expect(playableVideoUrl('')).toBe('');
    expect(playableVideoUrl(undefined)).toBe('');
  });
});
