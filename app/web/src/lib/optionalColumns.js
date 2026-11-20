// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Campos que só vão no pedido quando a coluna já existe na base de dados.
 *
 * Várias colunas de `site_settings` nasceram em migrações. O site e a base de dados são
 * publicados em passos separados, e o PostgREST recusa o pedido **inteiro** quando ele leva
 * uma coluna que não existe: uma migração ainda por aplicar deixava a equipa sem conseguir
 * gravar a configuração toda por causa de um campo que nem tocou. Por isso o painel lê a
 * linha, vê que colunas vieram (`'coluna' in registo`) e só envia essas.
 *
 * A parte que estava mal era o *como*. O padrão era
 *
 *     const data = { ...form, ...(temColuna ? { coluna: valor } : {}) };
 *
 * e isso nunca tira nada: o `...form` põe sempre a chave (o campo está no formulário), e o
 * spread condicional só a substitui quando a condição é verdadeira. A guarda que o código
 * dizia ter não existia — nunca mordeu porque as migrações estão aplicadas há muito.
 *
 * Aqui a chave é mesmo apagada, e a decisão vive num sítio só, testável.
 */

/**
 * Aplica ao objecto os grupos de campos opcionais, **alterando-o**.
 *
 * Cada grupo é `[existe, { campo: valor, … }]`: com `existe` verdadeiro os campos são
 * escritos, com `existe` falso são apagados do objecto.
 */
export function applyOptionalColumns(data, groups = []) {
  for (const [existe, campos] of groups) {
    for (const [chave, valor] of Object.entries(campos || {})) {
      if (existe) data[chave] = valor;
      else delete data[chave];
    }
  }
  return data;
}

/** Que colunas desta lista é que o registo lido tem mesmo. */
export const hasColumn = (registo, nome) => !!registo && typeof registo === 'object' && nome in registo;
