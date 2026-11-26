-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O ERP financeiro central (parte F do plano; sinc/financeiro.rs): cada movimento da tesouraria segue para o site, no
-- mesmo pedido que os documentos, o catálogo e os fechos, e lá fica uma cópia que não se altera (kangest_movimentos),
-- para a direcção ver o dinheiro de todas as lojas. Uma anulação segue também: no site só marca o movimento como
-- anulado (nunca se apaga nem se muda o valor). Só entra na fila com o posto ligado ao site.
CREATE TABLE IF NOT EXISTS sinc_financeiro (
    movimento_id INTEGER PRIMARY KEY REFERENCES movimentos_tesouraria(id),
    estado TEXT NOT NULL DEFAULT 'pendente',    -- pendente | feito
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT '',
    feito_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_sinc_financeiro_devidos ON sinc_financeiro(estado, proximo_em);

CREATE TRIGGER IF NOT EXISTS trg_sinc_financeiro_novo
AFTER INSERT ON movimentos_tesouraria
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE id = 1 AND ativa = 1)
BEGIN
    INSERT OR IGNORE INTO sinc_financeiro (movimento_id) VALUES (NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS trg_sinc_financeiro_anulado
AFTER UPDATE OF anulado ON movimentos_tesouraria
WHEN NEW.anulado = 1 AND OLD.anulado = 0 AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE id = 1 AND ativa = 1)
BEGIN
    INSERT INTO sinc_financeiro (movimento_id) VALUES (NEW.id)
    ON CONFLICT(movimento_id) DO UPDATE SET estado = 'pendente', tentativas = 0, proximo_em = 0, erro = '', feito_em = NULL;
END;
