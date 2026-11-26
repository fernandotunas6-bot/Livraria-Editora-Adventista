-- Correcções de dados de dois produtos, pedidas pelo dono (2026-11-26, na análise dos produtos sem referência do
-- KanGest). Cada uma só mexe no produto e no valor errado: se alguém já o tiver corrigido no painel, não volta atrás.

-- «T-shirt preta com o logótipo da Igreja Adventista do Sétimo Dia» estava marcada como edição digital: o site
-- tratava-a como um livro digital (uma por conta, sem envio, à espera de um ficheiro que não existe). É vestuário
-- físico, com stock. Não tem ficheiros nem encomendas.
update public.stock_books
   set digital = false
 where id = 'l4zawwlzaesoa76' and digital is true;

-- Os preços com cêntimos de um cálculo do IVA: 3 999,98 → 4 000 e 5 699,80 → 5 700; a promoção da UmaVoz27,
-- 5 500,11 → 5 500 (os tamanhos dela já estavam a 3 500 e 5 500).
update public.stock_books set price = 4000 where id = 'l4zawwlzaesoa76' and price = 3999.98;
update public.stock_books set price = 5700 where id = '3r7u5qwwq1qkm7s' and price = 5699.8;
update public.stock_books set sale_price = 5500 where id = '3r7u5qwwq1qkm7s' and sale_price = 5500.11;
