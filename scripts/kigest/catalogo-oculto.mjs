// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Os produtos do catálogo que a chave pública não vê.
//
// O scripts/kigest/migracao.mjs lê o catálogo do site com a chave pública — e a chave pública
// só lê o que está à venda: as regras de RLS escondem de quem não tem sessão tudo o que tem
// active = false. Isso deixou de fora os 93 produtos que a migração 20261110090000 trouxe das
// fotografias da loja, dos quais 72 continuam ocultos à espera de preço.
//
// Sem eles, a conciliação dava-os por inexistentes e a loja ficava com cada um duas vezes: o
// «ATIRADOR COVERTIDO» do KiGest entraria como produto novo ao lado do «O Atirador Convertido —
// E outras histórias de salvação e milagres» que já lá está. Quinze desses casos confirmam-se
// pelo id da loja da editora, que é o mesmo nos dois lados.
//
// Daqui saem com book_code vazio: não se sabe o código que o gatilho lhes deu em produção (a
// migração não o fixa, e o contador estava noutro ponto). Quem os liga é o título exacto, que é
// o que a migração escreveu e está aqui no repositório.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A raiz do repositório, a partir deste ficheiro (scripts/kigest/): os testes correm com a
// pasta do site como directório de trabalho e não encontrariam nada por caminho relativo.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIGRACAO_93 = 'supabase/migrations/20261110090000_produtos_novos_da_loja.sql';
const TABELA_93 = 'scripts/catalogo/produtos.py';

// (título, autor, editora, tipo, capa, descrição, prateleira) — a ordem do insert da migração.
const LINHA = /\(\$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$\)/gs;

// ('foto','tipo','título','autor','editora',('cpb','<id>')) — a tabela que a ronda das
// fotografias curou à mão. O id da editora é a prova mais forte que há para emparelhar: o
// KiGest usa-o como referência em muitos artigos.
const CURADO = /^\('([^']+)','([^']+)','(.*?)','(.*?)','(.*?)',\('(\w+)','([^']*)'\)\),$/gm;

export function catalogoOculto({ raiz = RAIZ, titulosAVista = [] } = {}) {
  let sql;
  try {
    sql = readFileSync(`${raiz}/${MIGRACAO_93}`, 'utf8');
  } catch {
    return [];
  }
  const porTitulo = new Map();
  for (const m of sql.matchAll(LINHA)) {
    const [, title, author, publisher, productType, cover, description, genre] = m;
    porTitulo.set(title, {
      book_code: '', title, author, publisher, product_type: productType, cover, description, genre,
      price: 0, stock: 0, isbn: '', active: false, kigest_ref: '', cpb: '',
      id: `oculto:${title}`,
    });
  }
  try {
    const tabela = readFileSync(`${raiz}/${TABELA_93}`, 'utf8');
    for (const m of tabela.matchAll(CURADO)) {
      const [, , , titulo, , , origem, ref] = m;
      const p = porTitulo.get(titulo);
      if (p && origem === 'cpb' && ref) p.cpb = ref;
    }
  } catch { /* sem a tabela curada perde-se só a ponte pelo id da editora */ }

  // Os que o dono já publicou vêm pela chave pública, com o book_code verdadeiro: esses ficam
  // de fora daqui, senão o mesmo produto entrava duas vezes na conciliação.
  const aVista = new Set(titulosAVista.map((t) => String(t ?? '').trim().toLowerCase()));
  return [...porTitulo.values()].filter((p) => !aVista.has(p.title.trim().toLowerCase()));
}
