-- Fotografias da loja de Catumbela (Benguela).
--
-- Terceira e última das lojas que mandaram fotografias nesta ronda (depois do Huambo,
-- 20261113103000, e do Lubango, 20261113143000). As cinco entram todas: a entrada do edifício,
-- a equipa, o atendimento ao balcão, a estante das Bíblias e os lenços de Desbravadores e
-- Aventureiros — que lembram a quem procura que a loja também vende artigos de igreja, e não só
-- livros. Convertidas por `scripts/imagens/lojas.py` e servidas pelo próprio site.
--
-- A miniatura não se escreve: sem uma escolhida, o site usa a primeira da galeria
-- (`fotoDaLoja`, app/web/src/lib/stores.js), que é a entrada do edifício — o que se reconhece
-- da rua. Se a loja já tiver uma miniatura escolhida no painel, essa fica.
--
-- Sem telefone nem horário: a loja ainda não os deu. Ficam vazios, e a lista do painel mostra-os
-- em falta («Sem telefone»).
--
-- Reverter: pôr gallery = '[]'::jsonb nesta loja; as fotografias ficam no site.

update public.physical_stores
set gallery = jsonb_build_array(
      jsonb_build_object('url', '/images/lojas/catumbela-1.webp',
                         'caption', 'A entrada da loja'),
      jsonb_build_object('url', '/images/lojas/catumbela-2.webp',
                         'caption', 'Quem atende na loja de Catumbela'),
      jsonb_build_object('url', '/images/lojas/catumbela-3.webp',
                         'caption', 'O balcão, com as prateleiras de livros ao fundo'),
      jsonb_build_object('url', '/images/lojas/catumbela-4.webp',
                         'caption', 'A estante das Bíblias'),
      jsonb_build_object('url', '/images/lojas/catumbela-5.webp',
                         'caption', 'Artigos de igreja: lenços de Desbravadores e Aventureiros')
    ),
    updated = now()
-- Pelo nome ou pela província: há uma loja por província (Benguela, Huambo e Huíla), e o nome
-- desta tanto pode trazer «Catumbela» como só «Benguela». A província compara-se sem acentos
-- (private.plain_text, 20261108220000_entregas_loja_e_robustez.sql).
where name ilike '%Catumbela%' or private.plain_text(province) = 'benguela';
