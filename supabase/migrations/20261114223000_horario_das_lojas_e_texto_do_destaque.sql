-- O horário das lojas passa a ser o que está na porta do Lubango, e o destaque do catálogo deixa
-- de dizer «Mais de 100 títulos».
--
-- 1. Lubango. A 20261113143000_fotografias_do_lubango já punha o horário escrito na porta (a
--    fotografia /images/lojas/lubango-1.webp): segunda a quinta das 8h às 17h30; sexta, domingo e
--    feriados das 8h às 13h; ao sábado não abre. Mas só substituía o vazio e o de omissão do
--    painel, e a ficha tinha «Seg–Sáb 9h–17h», escrito no painel e com o sábado aberto, ao
--    contrário da porta. Corrigido a pedido a 2026-11-14.
-- 2. Bié. A 20261114180000_lojas_donas_dos_dados criou-a com «o horário da porta da do Lubango»
--    (docs/LOJAS.md), mas copiou o que estava na ficha do Lubango, o «Seg–Sáb 9h–17h». Fica com o
--    da porta. Continua escondida até abrir.
-- 3. Huambo. Tinha o horário de omissão do painel («Seg–Sex 9h–18h, Sáb 9h–13h»), que vinha
--    preenchido no formulário e ninguém escreveu. Não há registo do verdadeiro. Para o Bié, o dono
--    pediu «o horário das outras lojas»; a 2026-11-14 decidiu-se usar no Huambo o mesmo, o da porta
--    do Lubango.
--    Em todas, só se a ficha ainda tiver o horário antigo: o que alguém tenha entretanto escrito no
--    painel fica como está. A Catumbela («Seg–Sex 9h–18h», escrito no painel) não muda.
-- 4. O destaque «Catálogo Oficial da Livraria» dizia «Mais de 100 títulos adventistas para toda a
--    família.». A 2026-11-14 havia 277 livros, 24 Bíblias e 3 revistas activos: «Centenas» continua
--    certo quando o stock mexe. Só se o texto ainda for o antigo.
--
-- Reverter: repor os textos antigos (acima) nas mesmas fichas, no painel ou com um update igual.

update public.physical_stores
set hours = 'Seg–Qui 8h–17h30 · Sex, Dom e feriados 8h–13h',
    updated = now()
where ((private.plain_text(province) in ('huila', 'bie') or name ilike '%Lubango%' or name ilike '%Bié%')
       and hours = 'Seg–Sáb 9h–17h')
   or ((private.plain_text(province) = 'huambo' or name ilike '%Huambo%')
       and hours = 'Seg–Sex 9h–18h, Sáb 9h–13h');

update public.hero_slides
set subtitle = 'Centenas de títulos adventistas para toda a família.',
    updated = now()
where subtitle = 'Mais de 100 títulos adventistas para toda a família.';
