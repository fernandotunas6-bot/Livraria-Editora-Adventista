-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- KANGEST ONE, fase A (services/auth.rs, `conta_local`): num KanGest ligado ao site, as pessoas entram com a conta do
-- site. As contas locais que não são ADMIN (o ADMIN fica como recurso) têm até esta data para se ligarem à conta do
-- site; depois dela, só lêem. Por omissão, 30 dias depois desta actualização. O administrador pode mudá-la em
-- Utilizadores.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('identidade.contas_locais_ate', date('now', 'localtime', '+30 days'));
