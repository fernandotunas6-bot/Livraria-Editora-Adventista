-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As capas dos livros do site como fotografias dos artigos (KANGEST ONE, integração total; pedido do dono a 27/11;
-- sinc/capas.rs). Cada artigo sem fotografia cuja referência tem um produto do site com capa recebe-a. Uma capa que não
-- se conseguiu trazer fica aqui com o erro, e só se tenta outra vez quando o endereço dela mudar.
CREATE TABLE IF NOT EXISTS capas_tentadas (
    artigo_id INTEGER PRIMARY KEY REFERENCES artigos(id) ON DELETE CASCADE,
    capa TEXT NOT NULL,
    erro TEXT NOT NULL,
    em TEXT NOT NULL
);

-- os produtos voltam a vir do site uma vez, para chegarem as capas que estão no Storage (o site passa a mandar o
-- endereço delas; antes só ia o endereço externo)
UPDATE sinc_cursores SET valor = '{}' WHERE nome = 'produtos';
