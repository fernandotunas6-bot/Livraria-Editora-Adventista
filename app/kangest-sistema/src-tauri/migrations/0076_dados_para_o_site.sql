-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Os dados das fichas dos artigos para os produtos do site que não os têm (KANGEST ONE, integração total; sinc/fichas.rs,
-- `livros_para_o_site`). O sentido contrário da 0075: lá os dados dos livros do site vão para as fichas, aqui o autor, a
-- editora, o idioma, o ano, as páginas e o ISBN das fichas vão para os produtos do site, só o que lá falta.
--
-- O que o site respondeu a cada livro, com a versão (o que foi, em texto): uma ficha que mude volta a seguir. Os
-- estados: feito, sem_produto, recusado (tenta outra vez um dia depois) e erro (tenta outra vez cada vez mais tarde).
CREATE TABLE livros_enviados (
    artigo_id INTEGER PRIMARY KEY REFERENCES artigos(id) ON DELETE CASCADE,
    versao TEXT NOT NULL,
    estado TEXT NOT NULL,
    erro TEXT NOT NULL DEFAULT '',
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,
    em TEXT NOT NULL
);
