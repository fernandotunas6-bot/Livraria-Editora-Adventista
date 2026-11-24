-- Tempo real da Loja online (src/sinc/tempo_real.rs): o tópico secreto deste posto no Realtime do site, por onde chega
-- o sinal «novidades» (sem dados) quando muda uma encomenda da loja. Vem do site no emparelhamento e em cada
-- sincronização; muda a cada emparelhamento.
ALTER TABLE sinc_ligacao ADD COLUMN tempo_real_topico TEXT NOT NULL DEFAULT '';
