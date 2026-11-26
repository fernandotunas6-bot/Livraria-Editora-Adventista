-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- KANGEST ONE (fase A, o que faltava): ligar uma conta local à conta do site da pessoa. O administrador indica o email
-- da conta do site; na primeira entrada com esse email, a conta local passa a ser a da pessoa (conta_site), com o
-- histórico dela, em vez de se criar um utilizador novo (services/auth.rs, login_site).
ALTER TABLE utilizadores ADD COLUMN ligar_conta_site TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_utilizadores_ligar_conta_site ON utilizadores(ligar_conta_site) WHERE ligar_conta_site IS NOT NULL;
