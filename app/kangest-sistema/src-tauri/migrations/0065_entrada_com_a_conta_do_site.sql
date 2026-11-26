-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Entrar com a conta do site (src/sinc/entrada.rs; docs/ENTRADA-COM-A-CONTA-DO-SITE.md): cada utilizador que entrou
-- com a conta do site fica ligado a ela (o id da conta no site), com a hora da última entrada confirmada pelo site.
-- Sem Internet, a cópia local vale 7 dias a partir dessa hora, com a mesma senha (guardada só como resumo, em
-- senha_hash, como a dos utilizadores locais).
ALTER TABLE utilizadores ADD COLUMN conta_site TEXT;
ALTER TABLE utilizadores ADD COLUMN conta_site_validada_em TEXT;
CREATE UNIQUE INDEX idx_utilizadores_conta_site ON utilizadores(conta_site) WHERE conta_site IS NOT NULL;
