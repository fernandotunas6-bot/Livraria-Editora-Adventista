-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Os dados dos livros do site nas fichas dos artigos (KANGEST ONE, integração total; sinc/fichas.rs). As novidades do
-- site passam a trazer o autor, a editora, o idioma, o ano e as páginas de cada livro; um artigo com a mesma referência
-- que não os tenha recebe-os, e o ISBN passa a ser o código de barras de um artigo que não tenha nenhum.
--
-- O que veio do site, campo a campo: um campo que já veio uma vez não volta. Se alguém o apagar à mão, fica apagado.
CREATE TABLE fichas_do_site (
    artigo_id INTEGER NOT NULL REFERENCES artigos(id) ON DELETE CASCADE,
    campo TEXT NOT NULL,
    valor TEXT NOT NULL,
    em TEXT NOT NULL,
    PRIMARY KEY (artigo_id, campo)
);

-- O catálogo do site vem todo outra vez uma vez, já com os dados novos (a cópia da Loja online actualiza-se; nada se
-- perde, e as encomendas e as igrejas continuam do seu cursor).
DELETE FROM sinc_cursores WHERE nome = 'produtos';
