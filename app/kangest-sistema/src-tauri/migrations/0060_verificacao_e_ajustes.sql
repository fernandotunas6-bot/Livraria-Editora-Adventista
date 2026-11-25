-- A verificação da base depois de cada actualização e os ajustes de dados entre versões (services/verificacao.rs,
-- src/ajustes.rs; docs/BASE-DE-DADOS.md, «Verificações» e «Ajustes de dados»).

-- O resultado de cada verificação: a automática, depois de uma actualização, e as feitas à mão em Sobre o KanGest.
-- Guardam-se as últimas 50.
CREATE TABLE verificacoes_base (
    id INTEGER PRIMARY KEY,
    feita_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    motivo TEXT NOT NULL,                       -- actualizacao | manual
    versao TEXT NOT NULL,                       -- a versão do KanGest que verificou
    versao_anterior TEXT,                       -- a de antes da actualização (só na automática)
    ok INTEGER NOT NULL,
    graves INTEGER NOT NULL DEFAULT 0,          -- graves com problemas (o ficheiro, as ligações, a AGT, a auditoria)
    avisos INTEGER NOT NULL DEFAULT 0,          -- as outras com problemas (o stock, o caixa)
    resumo TEXT NOT NULL,
    detalhe TEXT NOT NULL DEFAULT '[]',         -- JSON: cada verificação, com o que encontrou
    copia TEXT,                                 -- a cópia de antes da actualização, para a oferecer
    duracao_ms INTEGER NOT NULL DEFAULT 0,
    utilizador_id INTEGER REFERENCES utilizadores(id)
);

-- Os ajustes de dados entre versões: cada um corre uma vez, depois das migrações, na sua transacção. Um que falhe
-- fica com o erro (e aplicado_em vazio) e volta a tentar-se no arranque seguinte.
CREATE TABLE ajustes_dados (
    nome TEXT PRIMARY KEY,                      -- nunca muda depois de publicado
    versao TEXT NOT NULL,                       -- a versão do KanGest que trouxe o ajuste
    aplicado_em TEXT,
    resultado TEXT,
    erro TEXT,
    tentativas INTEGER NOT NULL DEFAULT 0,
    tentado_em TEXT
);
