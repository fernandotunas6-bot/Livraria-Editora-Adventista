-- Vigilância das encomendas: alertas de encomendas paradas tempo demais num passo, e um resumo
-- diário para a equipa. As regras estão na Edge Function (orderWatch.ts); aqui fica o registo dos
-- alertas (para avisar a equipa uma só vez por alerta) e os agendamentos.
--
-- Sem segredos neste ficheiro: o endereço e o token vêm do Vault, os mesmos do agendador da fila
-- de emails (mesma fronteira de confiança).

create table if not exists public.order_alerts (
  order_id text not null references public.orders (id) on delete cascade,
  kind text not null,
  severity text not null default 'warning',
  label text not null default '',
  detail text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (order_id, kind)
);

create index if not exists order_alerts_open_idx on public.order_alerts (last_seen_at desc) where resolved_at is null;

alter table public.order_alerts enable row level security;

create policy "order_alerts: equipa de encomendas lê" on public.order_alerts for select to authenticated
  using ((select private.has_permission('manage_orders')));

-- Chama a rota da vigilância. `p_summary` true: também envia o resumo diário.
create or replace function private.run_order_watch(p_summary boolean default false)
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
  v_url text;
begin
  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Vigilância: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  -- O endereço da fila é <...>/functions/v1/app/<rota>: troca-se a rota.
  v_url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/order-watch';
  perform http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := jsonb_build_object('summary', p_summary),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function private.run_order_watch(boolean) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('vigilancia-encomendas');
exception when others then null;
end
$$;
do $$
begin
  perform cron.unschedule('resumo-diario-encomendas');
exception when others then null;
end
$$;

do $$
begin
  -- De hora a hora, ao minuto 17 (fora do pico dos :00).
  perform cron.schedule('vigilancia-encomendas', '17 * * * *', 'select private.run_order_watch(false);');
  -- 06:29 UTC = 07:29 em Luanda: o resumo chega antes de a loja abrir.
  perform cron.schedule('resumo-diario-encomendas', '29 6 * * *', 'select private.run_order_watch(true);');
exception when others then
  raise notice 'Não foi possível agendar a vigilância (%): fica só no painel.', sqlerrm;
end
$$;
