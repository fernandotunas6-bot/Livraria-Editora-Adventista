-- O registo das impressões de cada documento (services/impressao.rs, docs/IMPRESSAO.md §Vias).
--
-- Serve para a via sair sozinha: a primeira impressão de um documento é o «Original» (e o «Duplicado»… conforme as
-- vias), e qualquer impressão a seguir sai como «2.ª via em conformidade com o original», como a AGT exige, com quem
-- a imprimiu e quando. Antes, a 2.ª via era uma caixa que alguém tinha de se lembrar de marcar.
CREATE TABLE documento_impressoes (
    id INTEGER PRIMARY KEY,
    documento_id INTEGER NOT NULL REFERENCES documentos(id),
    vias TEXT NOT NULL DEFAULT '[]',            -- JSON: as designações impressas, ex.: ["Original", "Duplicado"]
    segunda_via INTEGER NOT NULL DEFAULT 0,
    formato TEXT NOT NULL DEFAULT '',           -- a4 | a5 | talao | termica
    utilizador_id INTEGER REFERENCES utilizadores(id),
    posto_id INTEGER,
    impresso_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
);
CREATE INDEX idx_documento_impressoes_documento ON documento_impressoes(documento_id);
