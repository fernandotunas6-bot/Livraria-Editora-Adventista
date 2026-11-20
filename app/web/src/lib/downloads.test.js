// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  downloadAction, downloadFileName, downloadKindLabel, formatFileSize, newPdfPath, pdfFileError, variantLabel,
} from './downloads';

const pdfHead = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];

describe('materiais para descarregar', () => {
  it('mostra o tamanho em KB ou MB', () => {
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(500)).toBe('1 KB');
    expect(formatFileSize(830 * 1024)).toBe('830 KB');
    expect(formatFileSize(2.44 * 1024 * 1024)).toBe('2,4 MB');
  });

  it('aceita só PDFs a sério e até 50 MB', () => {
    expect(pdfFileError(null)).toMatch(/Escolha/);
    expect(pdfFileError({ name: 'a.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 })).toMatch(/50 MB/);
    expect(pdfFileError({ name: 'a.docx', type: 'application/msword', size: 10 })).toMatch(/Só/);
    expect(pdfFileError({ name: 'a.pdf', type: '', size: 10 }, [0x50, 0x4b, 3, 4, 0])).toMatch(/válido/);
    expect(pdfFileError({ name: 'a.pdf', type: '', size: 10 }, pdfHead)).toBe('');
  });

  it('cria caminhos no formato que a migração aceita', () => {
    const p = newPdfPath();
    expect(p).toMatch(/^files\/[A-Za-z0-9._-]+\.pdf$/);
    expect(newPdfPath()).not.toBe(p);
  });

  it('dá ao ficheiro um nome limpo a partir do título', () => {
    expect(downloadFileName('Lição: 3.º Trimestre 2026')).toBe('Licao-3-Trimestre-2026.pdf');
    expect(downloadFileName('', 'revista.PDF')).toBe('revista.pdf');
    expect(downloadFileName('???')).toBe('material.pdf');
  });

  it('nomeia a variante pelo índice', () => {
    const product = { versions: [{ label: 'Capa dura' }, { label: 'Digital', format: 'PDF' }] };
    expect(variantLabel(product, 1)).toBe('Digital · PDF');
    expect(variantLabel(product, null)).toBe('');
    expect(variantLabel(product, 5)).toBe('Variante 6');
  });

  it('decide o botão para quem lê', () => {
    expect(downloadAction({ access: 'free', can_download: true }).kind).toBe('download');
    expect(downloadAction({ access: 'paid', can_download: false }).kind).toBe('login');
    expect(downloadAction({ access: 'paid', can_download: false }, { isAuthed: true }).kind).toBe('buy');
    expect(downloadAction({ access: 'paid', can_download: true }, { isAuthed: true }).label).toMatch(/comprado/);
    expect(downloadKindLabel('licao')).toBe('Lição');
    expect(downloadKindLabel('x')).toBe('Outro');
  });
});
