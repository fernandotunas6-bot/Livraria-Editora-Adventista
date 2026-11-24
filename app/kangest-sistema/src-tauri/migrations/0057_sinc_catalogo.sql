-- O catálogo para o site pela ligação à livraria (src/sinc/catalogo.rs; docs/SINCRONIZACAO.md §Catálogo).
--
-- sinc_catalogo: os artigos que mudaram e ainda não seguiram. Um conjunto (uma linha por artigo e tipo), não uma fila de
-- movimentos: o que segue é o estado de agora, montado como nos avisos da API (webhooks.rs). `mudou` sobe a cada
-- mudança, para uma mudança feita enquanto o lote ia a caminho não se perder (a linha só sai se `mudou` não mudou).
--   tipo = 'stock'  — a existência, o reservado (NE por facturar) e o disponível de cada armazém;
--   tipo = 'artigo' — o nome, o preço com IVA, se está activo.
-- Os gatilhos só correm com a ligação activa, como os da fila dos documentos (0053), e apanham todas as formas de mudar o
-- stock (a tabela stock, escrita pelos documentos, pelo inventário e pelas importações) e as reservas (como 0034).
CREATE TABLE sinc_catalogo (
    artigo_id INTEGER NOT NULL REFERENCES artigos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('stock', 'artigo')),
    mudou INTEGER NOT NULL DEFAULT 1,
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (artigo_id, tipo)
);
CREATE INDEX idx_sinc_catalogo_devidos ON sinc_catalogo(proximo_em);

-- o stock: qualquer escrita na tabela stock
CREATE TRIGGER trg_sinc_stock_novo AFTER INSERT ON stock
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_catalogo (artigo_id, tipo) VALUES (NEW.artigo_id, 'stock')
    ON CONFLICT (artigo_id, tipo) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_stock AFTER UPDATE OF quantidade ON stock
WHEN NEW.quantidade IS NOT OLD.quantidade AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_catalogo (artigo_id, tipo) VALUES (NEW.artigo_id, 'stock')
    ON CONFLICT (artigo_id, tipo) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

-- o reservado: uma linha nova numa NE, e uma NE que muda de estado (facturada ou anulada liberta a reserva)
CREATE TRIGGER trg_sinc_reserva_linha AFTER INSERT ON documento_linhas
WHEN NEW.artigo_id IS NOT NULL AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
  AND (SELECT tipo_codigo FROM documentos WHERE id = NEW.documento_id) = 'NE'
BEGIN
    INSERT INTO sinc_catalogo (artigo_id, tipo) VALUES (NEW.artigo_id, 'stock')
    ON CONFLICT (artigo_id, tipo) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_reserva_estado AFTER UPDATE OF estado ON documentos
WHEN NEW.tipo_codigo = 'NE' AND NEW.estado <> OLD.estado AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_catalogo (artigo_id, tipo)
    SELECT DISTINCT l.artigo_id, 'stock' FROM documento_linhas l WHERE l.documento_id = NEW.id AND l.artigo_id IS NOT NULL
    ON CONFLICT (artigo_id, tipo) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

-- o artigo: novo ou alterado no que o site usa (o nome, o preço, a taxa, o tipo, activo, o código de barras). O custo
-- médio e o resto mudam a cada compra e venda e não interessam ao site.
CREATE TRIGGER trg_sinc_artigo_novo AFTER INSERT ON artigos
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_catalogo (artigo_id, tipo) VALUES (NEW.id, 'artigo')
    ON CONFLICT (artigo_id, tipo) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_artigo AFTER UPDATE OF referencia, descricao, tipo, preco1, taxa_iva_id, ativo, codigo_barras ON artigos
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_catalogo (artigo_id, tipo) VALUES (NEW.id, 'artigo')
    ON CONFLICT (artigo_id, tipo) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;
