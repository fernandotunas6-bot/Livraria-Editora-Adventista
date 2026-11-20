// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  isYoutubeUrl,
  parseYoutube,
  sanitizeYoutubeUrl,
  youtubeId,
  youtubeStartSeconds,
} from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('youtubeId', () => {
  it('lê o id das formas que as pessoas copiam', () => {
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(youtubeId(`https://youtube.com/watch?v=${ID}&list=PLabc&index=2`)).toBe(ID);
    expect(youtubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(youtubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(youtubeId(`https://youtu.be/${ID}?si=aBcDeF`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
    expect(youtubeId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
  });

  it('aceita o endereço sem esquema e o id escrito sozinho', () => {
    expect(youtubeId(`youtu.be/${ID}`)).toBe(ID);
    expect(youtubeId(`www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(youtubeId(ID)).toBe(ID);
    expect(youtubeId(`  ${ID}  `)).toBe(ID);
  });

  it('recusa tudo o que não é um vídeo do YouTube', () => {
    expect(youtubeId('')).toBe('');
    expect(youtubeId(null)).toBe('');
    expect(youtubeId(undefined)).toBe('');
    expect(youtubeId('https://vimeo.com/123456')).toBe('');
    // Um domínio que *acaba* em youtube.com não é o YouTube.
    expect(youtubeId(`https://evil-youtube.com/watch?v=${ID}`)).toBe('');
    expect(youtubeId(`https://youtube.com.evil.test/watch?v=${ID}`)).toBe('');
    // Credenciais no endereço: um truque antigo para o host parecer outro.
    expect(youtubeId(`https://www.youtube.com@evil.test/watch?v=${ID}`)).toBe('');
    // Id com o tamanho errado.
    expect(youtubeId('https://www.youtube.com/watch?v=abc')).toBe('');
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}x`)).toBe('');
  });

  it('recusa esquemas que executam código ou embutem conteúdo', () => {
    for (const mau of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      `javascript:void(0)//youtu.be/${ID}`,
    ]) {
      expect(youtubeId(mau)).toBe('');
      expect(isYoutubeUrl(mau)).toBe(false);
      expect(sanitizeYoutubeUrl(mau)).toBe('');
      expect(parseYoutube(mau)).toBeNull();
    }
  });
});

describe('youtubeStartSeconds', () => {
  it('entende os formatos de tempo do YouTube', () => {
    expect(youtubeStartSeconds(`https://youtu.be/${ID}?t=90`)).toBe(90);
    expect(youtubeStartSeconds(`https://youtu.be/${ID}?t=90s`)).toBe(90);
    expect(youtubeStartSeconds(`https://youtu.be/${ID}?t=1m30s`)).toBe(90);
    expect(youtubeStartSeconds(`https://youtu.be/${ID}?t=1h2m3s`)).toBe(3723);
    expect(youtubeStartSeconds(`https://www.youtube.com/watch?v=${ID}&start=45`)).toBe(45);
    expect(youtubeStartSeconds(`https://www.youtube.com/watch?v=${ID}#t=30`)).toBe(30);
  });

  it('zero quando não há tempo ou não se entende, e com tecto de um dia', () => {
    expect(youtubeStartSeconds(`https://youtu.be/${ID}`)).toBe(0);
    expect(youtubeStartSeconds(`https://youtu.be/${ID}?t=abc`)).toBe(0);
    expect(youtubeStartSeconds('')).toBe(0);
    expect(youtubeStartSeconds(`https://youtu.be/${ID}?t=999999999`)).toBe(86_400);
  });
});

describe('parseYoutube', () => {
  it('a incorporação é sempre do domínio sem cookies e construída por nós', () => {
    const v = parseYoutube(`https://www.youtube.com/watch?v=${ID}`);
    expect(v.id).toBe(ID);
    expect(v.embedUrl.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
    expect(v.autoplayUrl).toContain('autoplay=1');
    expect(v.embedUrl).not.toContain('autoplay=1');
    expect(v.embedUrl).toContain('rel=0');
    expect(v.thumbnail).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(v.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('o tempo de início segue para a incorporação e para o link', () => {
    const v = parseYoutube(`https://youtu.be/${ID}?t=1m30s`);
    expect(v.embedUrl).toContain('start=90');
    expect(v.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}&t=90`);
  });

  it('nada do endereço original entra no `src` da moldura', () => {
    // Parâmetros de rastreio e de lista não passam para a incorporação.
    const v = parseYoutube(`https://www.youtube.com/watch?v=${ID}&list=PLevil&si=rastreio&feature=share`);
    expect(v.embedUrl).not.toContain('list=');
    expect(v.embedUrl).not.toContain('si=');
    expect(v.embedUrl).not.toContain('feature=');
  });
});

describe('sanitizeYoutubeUrl', () => {
  it('normaliza o que vai para a base de dados e limpa o rastreio', () => {
    expect(sanitizeYoutubeUrl(`https://youtu.be/${ID}?si=aBcDeF`)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(sanitizeYoutubeUrl(`  https://m.youtube.com/watch?v=${ID}&list=PLx  `)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(sanitizeYoutubeUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('vazio quando não serve, para o produto ficar sem vídeo em vez de com um link partido', () => {
    expect(sanitizeYoutubeUrl('https://exemplo.invalid/video.mp4')).toBe('');
    expect(sanitizeYoutubeUrl('ainda não tenho')).toBe('');
    expect(sanitizeYoutubeUrl('')).toBe('');
  });
});
