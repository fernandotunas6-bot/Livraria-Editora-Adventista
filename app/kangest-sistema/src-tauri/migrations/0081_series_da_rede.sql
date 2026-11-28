-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O prefixo das séries que o site deu a este KanGest (pedido do dono a 28/11: criar lojas novas «sem riscos de
-- colisão»). Cada posto do site tem um prefixo único em toda a rede (HUA, LUB, HUA2…), para duas lojas com o mesmo NIF
-- nunca emitirem os mesmos números (FR 2026/1 nas duas). O KanGest guarda-o aqui e usa-o nos postos sem prefixo
-- (sinc/series.rs). Um posto com outro prefixo fica como está até alguém carregar em «Usar o prefixo do site».
ALTER TABLE sinc_ligacao ADD COLUMN serie_prefixo_site TEXT NOT NULL DEFAULT '';
