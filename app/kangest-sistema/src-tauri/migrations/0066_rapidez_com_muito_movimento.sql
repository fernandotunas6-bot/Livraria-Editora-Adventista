-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Rapidez com muito movimento (medido com 150 mil documentos, 450 mil linhas e 20 mil clientes; docs/BASE-DE-DADOS.md).
--
-- O «Consumidor final» fica com quase todas as vendas. Só com o índice pelo cliente, a lista dos documentos dele lia-os
-- todos e ordenava-os (1,9 s), e o saldo e o crédito de cada cliente na lista de clientes e no limite de crédito liam
-- cada documento (1,3 s). Pelo cliente e pela data, a lista sai já ordenada (22 ms); pelo cliente, o estado e os dois
-- valores, o saldo calcula-se só pelo índice, sem abrir os documentos (94 ms).
CREATE INDEX IF NOT EXISTS idx_docs_entidade_data ON documentos(entidade_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_docs_entidade_saldo ON documentos(entidade_id, estado, valor_pendente, credito_disponivel);
-- ficou coberto pelos dois de cima (começam pelo cliente)
DROP INDEX IF EXISTS idx_docs_entidade;

-- O NIF: gravar um cliente (já existe outro com este NIF?), a API e as importações procuravam-no em todos os clientes.
CREATE INDEX IF NOT EXISTS idx_entidades_nif ON entidades(nif);

-- Facturação electrónica: voltar a pôr pendentes os documentos de um pedido à AGT (há um envio por factura).
CREATE INDEX IF NOT EXISTS idx_fe_envios_pedido ON fe_envios(request_id) WHERE request_id IS NOT NULL;
