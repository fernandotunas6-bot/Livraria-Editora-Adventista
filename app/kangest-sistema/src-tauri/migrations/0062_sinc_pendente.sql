-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As dívidas nos relatórios do site (docs/SINCRONIZACAO.md, «O que vai para o site»): quando o que falta pagar de um
-- documento muda (um recibo, uma nota de crédito), o documento volta à fila, na mesma transacção, e o centro
-- actualiza o pendente da cópia (só esse campo: o resto da cópia não se altera). Só com a ligação activa e nos
-- documentos deste KanGest (os importados do KIGEST ficam de fora, como nos outros gatilhos da 0053). Um documento que
-- já espera na fila não entra outra vez: quando sair, leva o pendente de então.
CREATE TRIGGER trg_sinc_pendente AFTER UPDATE OF valor_pendente ON documentos
WHEN NEW.valor_pendente IS NOT OLD.valor_pendente AND NEW.importado = 0
  AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
  AND NOT EXISTS (SELECT 1 FROM sinc_saida s WHERE s.documento_id = NEW.id AND s.estado <> 'feito')
BEGIN
    INSERT INTO sinc_saida (documento_id, operacao) VALUES (NEW.id, 'pendente');
END;
