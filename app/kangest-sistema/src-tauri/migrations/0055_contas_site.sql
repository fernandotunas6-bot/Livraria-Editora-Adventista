-- As pessoas no KanGest com a conta do site (Livraria → Loja online; src/sinc/pessoa.rs; docs/LOJA-ONLINE.md).
--
-- sessoes_site: a sessão do site de cada pessoa deste KanGest (uma por utilizador), cifrada com a chave mestra
-- (segredos.rs). Acaba 12 horas depois de entrar (um turno), ao sair, ou ao desligar a ligação. Com MFA, fica à espera
-- do código (factor_id) e só depois serve.
-- loja_comandos: as alterações às encomendas feitas sem Internet, em nome de quem as fez; saem quando a ligação voltar.
ALTER TABLE sinc_ligacao ADD COLUMN auth_url TEXT NOT NULL DEFAULT '';
ALTER TABLE sinc_ligacao ADD COLUMN auth_apikey TEXT NOT NULL DEFAULT '';

CREATE TABLE sessoes_site (
    utilizador_id INTEGER PRIMARY KEY REFERENCES utilizadores(id),
    email TEXT NOT NULL,
    sessao TEXT NOT NULL,
    factor_id TEXT NOT NULL DEFAULT '',
    entrou_em INTEGER NOT NULL,
    actualizada_em INTEGER NOT NULL
);

CREATE TABLE loja_comandos (
    id INTEGER PRIMARY KEY,
    utilizador_id INTEGER NOT NULL REFERENCES utilizadores(id),
    encomenda_id TEXT NOT NULL,
    numero TEXT NOT NULL DEFAULT '',
    accao TEXT NOT NULL,
    dados TEXT NOT NULL DEFAULT '{}',
    estado TEXT NOT NULL DEFAULT 'pendente',    -- pendente | feito | erro
    tentativas INTEGER NOT NULL DEFAULT 0,
    erro TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    feito_em TEXT
);
CREATE INDEX idx_loja_comandos_estado ON loja_comandos(estado, id);
