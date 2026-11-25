-- Os documentos das encomendas online emitidos por este KanGest (src/sinc/encomendas.rs; docs/SINCRONIZACAO.md
-- §Encomendas online). O site manda as tarefas na resposta selada (a NE, a FR, a NC e as anulações de cada encomenda);
-- o KanGest emite-as pela própria API, com a chave interna «Loja online (ligação ao site)», e o resultado volta no
-- pedido seguinte.
--
-- sinc_ligacao.encomendas_chave_id: a chave interna (api_chaves), com o utilizador e o posto em nome de quem se emite.
-- sinc_tarefas: o resultado de cada tarefa, até seguir para o site. Sobrevive a um fecho inesperado: a tarefa não volta
-- a ser emitida (e, mesmo que voltasse, a Idempotency-Key dava o mesmo documento).
ALTER TABLE sinc_ligacao ADD COLUMN encomendas_chave_id INTEGER REFERENCES api_chaves(id);

CREATE TABLE sinc_tarefas (
    id INTEGER PRIMARY KEY,                     -- a linha da fila do site (kangest_fila.id)
    accao TEXT NOT NULL,                        -- ne | fr | nc | anular
    ok INTEGER NOT NULL,
    resultado TEXT NOT NULL,                    -- JSON {documento} ou {erro, estado}
    feito_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    enviado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sinc_tarefas_por_enviar ON sinc_tarefas(enviado);
