-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O que faltava importar do KIGEST (services/importar_faltava.rs; docs/MIGRACAO-KIGEST.md, «O que faltava»):

-- As permissões de cada utilizador do KIGEST, aproximadas às do KanGest: NULL (nunca vieram do KIGEST), 'rever'
-- (vieram e o administrador ainda não as viu) ou 'revisto' (o administrador guardou o utilizador). Uma importação
-- seguinte não volta a mexer num utilizador já revisto nem num com permissões próprias.
ALTER TABLE utilizadores ADD COLUMN permissoes_kigest TEXT;

-- As vendas suspensas do POS do KIGEST: as que já vieram ficam registadas aqui. Retomar uma no POS apaga-a da lista
-- das suspensas; sem este registo, a importação automática seguinte trazia-a outra vez.
ALTER TABLE vendas_suspensas ADD COLUMN id_origem TEXT;
CREATE TABLE kigest_suspensos_importados (
    id_origem TEXT PRIMARY KEY,
    importado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- As prestações sociais pagas (subsídio de maternidade, doença…): o id de lá e os meses pagos.
ALTER TABLE rh_prestacoes ADD COLUMN id_origem TEXT;
CREATE UNIQUE INDEX idx_rh_prestacoes_origem ON rh_prestacoes(id_origem) WHERE id_origem IS NOT NULL;
CREATE TABLE rh_prestacao_pagamentos (
    id INTEGER PRIMARY KEY,
    prestacao_id INTEGER NOT NULL REFERENCES rh_prestacoes(id) ON DELETE CASCADE,
    mes_referencia TEXT NOT NULL,            -- o mês a que o pagamento respeita (AAAA-MM ou o texto do KIGEST)
    data TEXT,                               -- quando foi processado
    valor INTEGER NOT NULL DEFAULT 0         -- cêntimos
);
CREATE INDEX idx_rh_prestacao_pagamentos ON rh_prestacao_pagamentos(prestacao_id);
