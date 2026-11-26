-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- KANGEST ONE, fase A (sinc/pessoa.rs): a sessão do site de cada pessoa passa a viver só em memória. Nenhum token se
-- grava no disco, e ao abrir o programa outra vez é preciso entrar de novo. A tabela onde ficavam (cifradas) sai com os
-- tokens que ainda lá estavam.
DROP TABLE IF EXISTS sessoes_site;
