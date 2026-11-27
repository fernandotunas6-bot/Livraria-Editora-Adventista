-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As famílias dos artigos e os géneros do site (KANGEST ONE, integração total; sinc/fichas.rs, `generos`). Sem nada aqui,
-- uma família liga-se sozinha ao género do site com o mesmo nome (sem maiúsculas nem acentos, «&» como «e»). Aqui fica
-- a ligação feita à mão: um género (o nome como o site o tem), ou vazio para «não ligar».
--
-- Com a ligação, um artigo na família «Geral» (ou sem família) recebe a família ligada ao género do seu produto no site,
-- e o produto do site em «Catálogo Geral» (ou sem género) recebe o género da família do artigo.
CREATE TABLE familias_no_site (
    familia_id INTEGER PRIMARY KEY REFERENCES familias(id) ON DELETE CASCADE,
    genero TEXT NOT NULL,
    em TEXT NOT NULL
);
