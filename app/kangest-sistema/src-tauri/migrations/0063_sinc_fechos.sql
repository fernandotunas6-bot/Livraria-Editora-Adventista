-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- A cópia de cada fecho de caixa no site (src/sinc/fechos.rs; docs/FECHO-DE-CAIXA.md, «A cópia no site»).
--
-- Uma fila própria, ao lado da dos documentos (a sinc_saida só leva documentos): cada fecho arquivado (0061) entra
-- aqui, na mesma transacção que o arquiva, só com a ligação activa. Os fechos que vieram do KIGEST (sessões com
-- id_origem) não seguem. Quando o centro o recebe, fica «feito» (não se apaga: sem isso, ligar outra vez voltaria a
-- mandar todos).
CREATE TABLE sinc_fechos (
    fecho_id INTEGER PRIMARY KEY REFERENCES caixa_fechos(id),
    estado TEXT NOT NULL DEFAULT 'pendente',    -- pendente | feito
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT '',
    feito_em TEXT
);
CREATE INDEX idx_sinc_fechos_devidos ON sinc_fechos(estado, proximo_em);

CREATE TRIGGER trg_sinc_fecho AFTER INSERT ON caixa_fechos
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
  AND NOT EXISTS (SELECT 1 FROM caixa_sessoes s WHERE s.id = NEW.sessao_id AND s.id_origem IS NOT NULL)
BEGIN
    INSERT OR IGNORE INTO sinc_fechos (fecho_id) VALUES (NEW.id);
END;
