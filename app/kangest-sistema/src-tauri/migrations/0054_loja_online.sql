-- A cópia local da Loja online (Livraria → Loja online; src/sinc/loja.rs; docs/LOJA-ONLINE.md): as encomendas desta
-- loja e o catálogo do site, como vieram na última sincronização. Lê-se também sem Internet. Só se lê aqui: as
-- alterações fazem-se no painel do site, aberto no navegador do KanGest, com o login de cada pessoa.
-- `dados` guarda o registo inteiro (JSON); as outras colunas servem para filtrar e ordenar.
CREATE TABLE loja_encomendas (
    id TEXT PRIMARY KEY,
    numero TEXT NOT NULL DEFAULT '',
    criada_em TEXT NOT NULL DEFAULT '',
    actualizada_em TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT '',
    pagamento TEXT NOT NULL DEFAULT '',
    entrega TEXT NOT NULL DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    levantamento INTEGER NOT NULL DEFAULT 0,
    cliente TEXT NOT NULL DEFAULT '',
    telefone TEXT NOT NULL DEFAULT '',
    dados TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_loja_encomendas_criada ON loja_encomendas(criada_em);

CREATE TABLE loja_produtos (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL DEFAULT '',
    referencia TEXT NOT NULL DEFAULT '',
    isbn TEXT NOT NULL DEFAULT '',
    preco REAL NOT NULL DEFAULT 0,
    stock REAL NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    actualizado_em TEXT NOT NULL DEFAULT '',
    dados TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_loja_produtos_referencia ON loja_produtos(referencia);

-- Onde a última sincronização parou, por tipo (o par (actualizado, id) que o site devolveu).
CREATE TABLE sinc_cursores (
    nome TEXT PRIMARY KEY,
    valor TEXT NOT NULL DEFAULT '{}'
);

ALTER TABLE sinc_ligacao ADD COLUMN site_url TEXT NOT NULL DEFAULT '';
