-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Abrir os ecrãs do KanGest a partir do site pelo servidor da loja (pedido do dono a 27/11: «links… abrir sem protocolo
-- com rotas permitidas», escolha «Pelo servidor da loja»).
--
-- **Automático:** o KanGest servidor da loja, com o modo web ligado, diz o seu endereço na rede da loja em cada volta
-- (`estado_computador.endereco_web`, só um IPv4 privado).
-- **Manual, ao lado:** quem gere as configurações escreve outro endereço no painel (um nome da rede da loja, outra
-- porta). Vale o manual.
--
-- «Abrir no KanGest» no painel abre esse endereço com uma das rotas permitidas (a encomenda na Loja online, a Loja
-- online filtrada, a ajuda) e o KanGest pede a entrada, como sempre. Sem endereço, fica a ligação kangest://.

alter table public.kangest_postos add column if not exists endereco_web text not null default '';
alter table public.kangest_postos drop constraint if exists kangest_postos_endereco_web_check;
alter table public.kangest_postos add constraint kangest_postos_endereco_web_check
  check (endereco_web = '' or endereco_web ~ '^https?://[A-Za-z0-9.-]{1,80}(:[0-9]{1,5})?$');
comment on column public.kangest_postos.endereco_web is
  'O endereço do modo web do KanGest na rede da loja, escrito à mão no painel (vale por cima do que o posto diz em estado_computador.endereco_web). Vazio: o que o posto diz.';
