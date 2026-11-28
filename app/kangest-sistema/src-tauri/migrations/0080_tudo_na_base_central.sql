-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Tudo na base central (pedido do dono a 27/11: «migrar todos os dados actuais da loja Huambo… recibos, livros, vendas,
-- fecho, clientes, configurações todas… sincronização completa e total com o backend do Supabase»). Com o KanGest
-- ligado ao site, já seguiam os documentos feitos no KanGest, os fechos, o catálogo, as fichas (0079) e a tesouraria do
-- último ano. Faltavam:
-- 1. as configurações (sinc/configuracoes.rs): uma fotografia sem segredos, que segue quando muda;
-- 2. o histórico importado do KIGEST (`documentos.importado = 1`): as vendas, os recibos e as notas de antes do KanGest.
--    Seguem marcados como importados: o site não os confere na cadeia de assinaturas do KanGest (têm a do KIGEST);
-- 3. a tesouraria toda, não só a do último ano.
-- Sem Internet, tudo espera nas filas, como o resto.

ALTER TABLE sinc_ligacao ADD COLUMN configuracoes_resumo TEXT NOT NULL DEFAULT '';
ALTER TABLE sinc_ligacao ADD COLUMN configuracoes_em TEXT;
ALTER TABLE sinc_ligacao ADD COLUMN configuracoes_tentativas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sinc_ligacao ADD COLUMN configuracoes_proximo_em INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sinc_ligacao ADD COLUMN configuracoes_erro TEXT NOT NULL DEFAULT '';

-- o histórico importado com o KanGest já ligado (uma importação feita depois de ligar) também segue
CREATE TRIGGER trg_sinc_documento_importado AFTER INSERT ON documentos
WHEN NEW.importado = 1 AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_saida (documento_id, operacao) VALUES (NEW.id, 'emitido');
END;

-- o que falta pagar de uma factura importada também muda (um recibo feito no KanGest): segue, como nas outras (0062)
CREATE TRIGGER trg_sinc_pendente_importado AFTER UPDATE OF valor_pendente ON documentos
WHEN NEW.valor_pendente IS NOT OLD.valor_pendente AND NEW.importado = 1
  AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
  AND NOT EXISTS (SELECT 1 FROM sinc_saida s WHERE s.documento_id = NEW.id AND s.estado <> 'feito')
BEGIN
    INSERT INTO sinc_saida (documento_id, operacao) VALUES (NEW.id, 'pendente');
END;

-- um KanGest já ligado manda agora o histórico importado (o que já seguiu não se repete)
INSERT INTO sinc_saida (documento_id, operacao)
SELECT d.id, 'emitido' FROM documentos d
 WHERE d.importado = 1
   AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
   AND NOT EXISTS (SELECT 1 FROM sinc_saida s WHERE s.documento_id = d.id AND s.operacao = 'emitido')
 ORDER BY d.id;

-- e a tesouraria de antes do último ano (o centro ignora os movimentos que já tiver)
INSERT OR IGNORE INTO sinc_financeiro (movimento_id)
SELECT id FROM movimentos_tesouraria
 WHERE EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
 ORDER BY id;
