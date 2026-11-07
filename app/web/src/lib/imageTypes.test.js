import { describe, expect, it } from 'vitest';
import { ALLOWED_IMAGE_ACCEPT, ALLOWED_IMAGE_TYPES, imageFileError, isAllowedImage } from './imageTypes';

const ficheiro = (type, sizeMB = 0.1) => ({ type, size: Math.round(sizeMB * 1024 * 1024), name: `x.${type.split('/')[1]}` });

describe('tipos de imagem aceites', () => {
  it('aceita os formatos que não executam código', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(isAllowedImage(ficheiro(type))).toBe(true);
      expect(imageFileError(ficheiro(type), 2)).toBe('');
    }
  });

  // O ponto desta lista: o bucket `media` é público e um SVG servido como image/svg+xml é um
  // documento que executa `<script>` quando aberto directamente. Ver a migração
  // `svg_fora_do_bucket_publico`.
  it('recusa SVG', () => {
    expect(isAllowedImage(ficheiro('image/svg+xml'))).toBe(false);
    expect(imageFileError(ficheiro('image/svg+xml'), 2)).toMatch(/Formato não suportado/);
    expect(ALLOWED_IMAGE_TYPES).not.toContain('image/svg+xml');
    expect(ALLOWED_IMAGE_ACCEPT).not.toMatch(/svg/);
  });

  it('recusa HTML, PDF e ficheiros sem tipo', () => {
    expect(isAllowedImage(ficheiro('text/html'))).toBe(false);
    expect(isAllowedImage(ficheiro('application/pdf'))).toBe(false);
    expect(isAllowedImage({ name: 'x', size: 10 })).toBe(false);
    expect(imageFileError(null)).toMatch(/Escolha um ficheiro/);
  });

  // A ordem conta: um SVG pequeno tem de dar erro de formato, não passar por ser leve.
  it('valida o formato antes do tamanho', () => {
    expect(imageFileError(ficheiro('image/svg+xml', 0.01), 2)).toMatch(/Formato não suportado/);
  });

  it('valida o tamanho quando o formato serve, e ignora o limite a 0', () => {
    expect(imageFileError(ficheiro('image/png', 5), 2)).toMatch(/demasiado grande/);
    expect(imageFileError(ficheiro('image/png', 5))).toBe('');
  });
});
