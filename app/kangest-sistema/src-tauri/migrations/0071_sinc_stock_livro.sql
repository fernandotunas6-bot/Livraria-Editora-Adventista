-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O livro único de stock (KANGEST ONE, fase B1; sinc/livro.rs). Cada movimento de stock segue para o livro central do
-- site, com a chave de idempotência do id local. Antes, na primeira volta com o livro (e sempre que o posto volta a
-- ligar-se), segue a abertura: a existência de cada artigo em cada armazém nessa hora. A fila só se enche depois da
-- abertura deste posto (config `stock_livro.posto`), para nenhum movimento contar duas vezes.
CREATE TABLE IF NOT EXISTS sinc_stock_livro (
    mov_id INTEGER PRIMARY KEY REFERENCES movimentos_stock(id),
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sinc_stock_livro_devidos ON sinc_stock_livro(proximo_em);

-- a abertura por enviar (sai da tabela à medida que o site a aceita)
CREATE TABLE IF NOT EXISTS sinc_stock_abertura (
    armazem_id INTEGER NOT NULL,
    artigo_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    momento TEXT NOT NULL,
    PRIMARY KEY (armazem_id, artigo_id)
);

CREATE TRIGGER IF NOT EXISTS trg_sinc_stock_livro
AFTER INSERT ON movimentos_stock
WHEN EXISTS (
    SELECT 1 FROM sinc_ligacao l JOIN config c ON c.chave = 'stock_livro.posto' AND c.valor = l.posto_id
    WHERE l.id = 1 AND l.ativa = 1
)
BEGIN
    INSERT OR IGNORE INTO sinc_stock_livro (mov_id) VALUES (NEW.id);
END;
