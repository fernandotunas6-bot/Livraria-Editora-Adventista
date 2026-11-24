-- Ligação do KanGest Livraria à base central da livraria (src/sinc/; docs/SINCRONIZACAO.md).
--
-- sinc_ligacao: a ligação deste KanGest (uma só): o endereço do site, o posto, a semente da chave Ed25519 deste posto
-- (cifrada com a chave mestra, segredos.rs) e a chave pública X25519 do centro.
-- sinc_saida: a fila. Cada documento emitido, anulado ou facturado entra aqui pelos gatilhos abaixo, na mesma
-- transacção que o grava, só enquanto houver ligação; os importados do KIGEST ficam de fora, como nos avisos (0026).
CREATE TABLE sinc_ligacao (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    url TEXT NOT NULL,
    posto_id TEXT NOT NULL,
    posto_nome TEXT NOT NULL DEFAULT '',
    loja TEXT NOT NULL DEFAULT '',
    chave_assinatura TEXT NOT NULL,
    centro_kid TEXT NOT NULL,
    centro_chave TEXT NOT NULL,
    ativa INTEGER NOT NULL DEFAULT 1,
    emparelhado_em TEXT NOT NULL,
    ultima_sinc TEXT,
    ultimo_erro TEXT NOT NULL DEFAULT ''
);

CREATE TABLE sinc_saida (
    id INTEGER PRIMARY KEY,
    documento_id INTEGER NOT NULL REFERENCES documentos(id),
    operacao TEXT NOT NULL,                     -- emitido | anulado | facturado
    estado TEXT NOT NULL DEFAULT 'pendente',    -- pendente | feito | erro
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    feito_em TEXT
);
CREATE INDEX idx_sinc_saida_devidos ON sinc_saida(estado, proximo_em);
CREATE INDEX idx_sinc_saida_documento ON sinc_saida(documento_id);

CREATE TRIGGER trg_sinc_documento AFTER INSERT ON documentos
WHEN NEW.importado = 0 AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_saida (documento_id, operacao) VALUES (NEW.id, 'emitido');
END;

CREATE TRIGGER trg_sinc_estado AFTER UPDATE OF estado ON documentos
WHEN NEW.estado <> OLD.estado AND NEW.estado IN ('A', 'F') AND NEW.importado = 0
  AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_saida (documento_id, operacao) VALUES (NEW.id, CASE NEW.estado WHEN 'A' THEN 'anulado' ELSE 'facturado' END);
END;
