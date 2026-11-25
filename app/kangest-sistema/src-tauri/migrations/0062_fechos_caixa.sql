-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O fecho de caixa arquivado, com as vendas online à parte e a cópia no site (services/caixa_fechos.rs;
-- docs/UTILIZADORES.md §Fecho de caixa; docs/SINCRONIZACAO.md §Fechos de caixa).
--
-- caixa_fechos: o relatório Z como ficou no momento do fecho (o instantâneo em JSON), gravado na mesma transacção que
-- fecha o caixa, com um selo SHA-256 do texto gravado. A reimpressão lê o instantâneo: um documento anulado depois do
-- fecho já não muda um Z antigo. Não se altera nem se apaga.
-- Os fechos de antes desta versão (e os importados do KIGEST) ganham o arquivo ao abrir a base, com os valores desse
-- dia, marcados como reconstruídos (db.rs → caixa_fechos::arquivar_antigos: o selo calcula-se em Rust).
CREATE TABLE caixa_fechos (
    id INTEGER PRIMARY KEY,
    sessao_id INTEGER NOT NULL UNIQUE REFERENCES caixa_sessoes(id),
    posto_id INTEGER,
    numero_z INTEGER,
    instantaneo TEXT NOT NULL,                  -- JSON: o relatório Z completo
    selo TEXT NOT NULL,                         -- SHA-256 (hex) do instantâneo, tal como está gravado
    reconstruido INTEGER NOT NULL DEFAULT 0,    -- 1: fecho anterior ao arquivo, refeito com os valores do dia do arquivo
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    criado_por INTEGER REFERENCES utilizadores(id)
);
-- o n.º Z é único por posto (os reconstruídos ficam de fora: uma base antiga podia ter números repetidos)
CREATE UNIQUE INDEX idx_caixa_fechos_z ON caixa_fechos(posto_id, numero_z) WHERE reconstruido = 0 AND numero_z IS NOT NULL;
CREATE INDEX idx_caixa_fechos_criado ON caixa_fechos(criado_em);

CREATE TRIGGER caixa_fechos_nao_se_altera BEFORE UPDATE ON caixa_fechos
BEGIN
    SELECT RAISE(ABORT, 'Um fecho de caixa arquivado não se altera.');
END;

CREATE TRIGGER caixa_fechos_nao_se_apaga BEFORE DELETE ON caixa_fechos
BEGIN
    SELECT RAISE(ABORT, 'Um fecho de caixa arquivado não se apaga.');
END;

-- As vendas online que cada Z incluiu: os documentos emitidos pela API (sem caixa) e as encomendas pagas da cópia
-- local da Loja online ainda sem FR. Cada venda fecha uma só vez: o primeiro Z que a inclui fica com ela, mesmo com
-- vários postos na mesma loja. Não contam para o numerário da gaveta. Não se alteram nem se apagam.
CREATE TABLE caixa_fecho_online (
    id INTEGER PRIMARY KEY,
    fecho_id INTEGER NOT NULL REFERENCES caixa_fechos(id),
    documento_id INTEGER UNIQUE REFERENCES documentos(id),
    encomenda_id TEXT UNIQUE,                   -- loja_encomendas.id (o id da encomenda no site)
    encomenda_numero TEXT NOT NULL DEFAULT '',  -- o n.º da encomenda (a FR que vier depois leva-o na referência)
    valor INTEGER NOT NULL DEFAULT 0,           -- cêntimos; negativo numa nota de crédito
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    CHECK ((documento_id IS NULL) <> (encomenda_id IS NULL))
);
CREATE INDEX idx_caixa_fecho_online_fecho ON caixa_fecho_online(fecho_id);
CREATE INDEX idx_caixa_fecho_online_numero ON caixa_fecho_online(encomenda_numero) WHERE encomenda_numero <> '';

CREATE TRIGGER caixa_fecho_online_nao_se_altera BEFORE UPDATE ON caixa_fecho_online
BEGIN
    SELECT RAISE(ABORT, 'As vendas online de um fecho de caixa não se alteram.');
END;

CREATE TRIGGER caixa_fecho_online_nao_se_apaga BEFORE DELETE ON caixa_fecho_online
BEGIN
    SELECT RAISE(ABORT, 'As vendas online de um fecho de caixa não se apagam.');
END;

-- Uma encomenda paga «sem FR» procura a FR pela referência (o n.º da encomenda).
CREATE INDEX IF NOT EXISTS idx_docs_referencia ON documentos(referencia) WHERE referencia <> '';

-- A cópia do fecho no site (src/sinc/fechos.rs): uma fila própria, ao lado da dos documentos (a sinc_saida só leva
-- documentos). Entra pelo gatilho, na mesma transacção que arquiva o fecho, só com a ligação activa; os fechos
-- importados do KIGEST não seguem. Sai quando o centro o recebe.
CREATE TABLE sinc_fechos (
    fecho_id INTEGER PRIMARY KEY REFERENCES caixa_fechos(id),
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_sinc_fechos_devidos ON sinc_fechos(proximo_em);

CREATE TRIGGER trg_sinc_fecho AFTER INSERT ON caixa_fechos
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
  AND NOT EXISTS (SELECT 1 FROM caixa_sessoes s WHERE s.id = NEW.sessao_id AND s.id_origem IS NOT NULL)
BEGIN
    INSERT OR IGNORE INTO sinc_fechos (fecho_id) VALUES (NEW.id);
END;
