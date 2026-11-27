-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As promoções dos artigos no site (KANGEST ONE, integração total; sinc/promocoes.rs). A promoção de um artigo (a
-- percentagem entre duas datas) segue para o produto do site com a mesma referência, se este KanGest mandar no catálogo;
-- o site nunca substitui uma promoção do painel e só retira as que o KanGest pôs.
--
-- O que o site respondeu a cada promoção, com a versão (a promoção e o PVP, em texto): uma que mude volta a seguir. Os
-- estados: feita, retirada, sem_produto, tem_promocao (o painel tem uma; tenta outra vez um dia depois), recusada (um
-- dia depois) e erro (cada vez mais tarde).
CREATE TABLE promocoes_enviadas (
    artigo_id INTEGER PRIMARY KEY REFERENCES artigos(id) ON DELETE CASCADE,
    versao TEXT NOT NULL,
    estado TEXT NOT NULL,
    erro TEXT NOT NULL DEFAULT '',
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,
    em TEXT NOT NULL
);
