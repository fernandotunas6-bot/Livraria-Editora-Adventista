-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O estado do computador de cada posto do KanGest Livraria, para o painel (Configurações → KanGest → Postos): a versão,
-- o sistema, os núcleos, a memória, o espaço livre, o tamanho da base, a última cópia de segurança, os documentos
-- rejeitados pela AGT e por enviar, a última verificação da base e as opções da bandeja e do sono. Chega em cada volta
-- da sincronização, dentro do envelope assinado e cifrado, e a Edge Function só guarda os campos de uma lista fechada
-- (kangestSinc.ts, limparEstadoComputador): nunca dados pessoais nem da loja. Só o servidor lê e escreve (como o resto
-- da tabela).
alter table public.kangest_postos add column if not exists estado_computador jsonb not null default '{}'::jsonb;
alter table public.kangest_postos add column if not exists estado_em timestamptz;
comment on column public.kangest_postos.estado_computador is
  'O estado do computador do posto na última volta (kangestSinc.ts, limparEstadoComputador): só números e marcas do computador.';
comment on column public.kangest_postos.estado_em is 'Quando chegou o último estado do computador.';
