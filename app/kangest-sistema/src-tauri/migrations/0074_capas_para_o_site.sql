-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As fotografias dos artigos para os produtos do site sem capa (KANGEST ONE, integração total; sinc/capas.rs,
-- `para_o_site`). O sentido contrário da 0073: lá as capas do site vêm para os artigos, aqui as fotografias dos artigos
-- vão para os produtos do site que não têm nenhuma.
--
-- O que o site respondeu a cada fotografia, com a versão dela (`artigo_fotos.alterado_em`): uma fotografia nova do mesmo
-- artigo volta a seguir. Os estados: posta (já é a capa do produto), tem_capa (o produto já tinha uma; nunca se
-- substitui), sem_produto, recusada (tenta outra vez um dia depois) e erro (tenta outra vez cada vez mais tarde).
CREATE TABLE capas_enviadas (
    artigo_id INTEGER PRIMARY KEY REFERENCES artigos(id) ON DELETE CASCADE,
    versao TEXT NOT NULL,
    estado TEXT NOT NULL,
    erro TEXT NOT NULL DEFAULT '',
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,
    em TEXT NOT NULL
);
