import { describe, expect, it } from 'vitest';
import { csvSafeText } from './orderExport';

describe('csvSafeText', () => {
  it('neutraliza o que o Excel leria como fórmula', () => {
    expect(csvSafeText('=HYPERLINK("http://x.invalid","Clique")')).toBe(`'=HYPERLINK("http://x.invalid","Clique")`);
    expect(csvSafeText('+244 923 000 000')).toBe("'+244 923 000 000");
    expect(csvSafeText('-1+2')).toBe("'-1+2");
    expect(csvSafeText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvSafeText('\t=1')).toBe("'\t=1");
  });
  it('deixa o resto igual', () => {
    expect(csvSafeText('Maria João')).toBe('Maria João');
    expect(csvSafeText('1250.00')).toBe('1250.00');
    expect(csvSafeText(null)).toBe('');
    expect(csvSafeText('a=b')).toBe('a=b');
  });
});
