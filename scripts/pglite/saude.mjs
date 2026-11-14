// Cenários da saúde do site (migração saude_do_site): erros e Core Web Vitals medidos em quem
// visita, com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/saude.mjs supabase/migrations
// Instruções em base.mjs.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const raises = async (name, fn, re) => {
  try { await fn(); fail++; console.log('FALHOU (devia recusar):', name); }
  catch (e) { if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', name, '→', e.message); } else ok++; }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const svc = (sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                         set_config('request.headers', '{}', true)`);
  await tx.exec('set local role service_role');
  return (await tx.query(sql, params)).rows;
});
const as = (role, sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};

const gestor = await user('gestor@loja.ao', 'manager', { manage_settings: true });
const vendas = await user('vendas@loja.ao', 'manager', { manage_orders: true });
const cliente = await user('cliente@exemplo.ao');

const vital = (name, value, page = '/', device = 'mobile') => ({ kind: 'vital', name, value, page, device, app_version: '2026.11.11-abc1234' });
const erro = (name, page = '/shop') => ({ kind: 'error', name, page, device: 'mobile', detail: { source: '/assets/index.js', line: 1, col: 2 } });

// --- 1. Quem grava -----------------------------------------------------------------------
const lcps = [1800, 2200, 2600, 3000, 4000];
const [{ site_health_record: gravados }] = await svc(`select public.site_health_record($1::jsonb)`, [JSON.stringify([
  ...lcps.map((v) => vital('LCP', v)),
  vital('INP', 120), vital('CLS', 0.05),
  vital('LCP', 900, '/', 'desktop'),
  erro('TypeError: x is undefined'), erro('TypeError: x is undefined', '/product/:id'),
])]);
check('a Edge Function grava um lote', gravados === 10, gravados);
const muitos = Array.from({ length: 25 }, () => vital('FCP', 1000));
const [{ site_health_record: cortados }] = await svc(`select public.site_health_record($1::jsonb)`, [JSON.stringify(muitos)]);
check('no máximo 20 por lote', cortados === 20, cortados);

await raises('o anónimo não grava (só pela Edge Function)', () => as('anon', null, `select public.site_health_record('[]'::jsonb)`), /permission denied/);
await raises('um cliente não grava', () => as('authenticated', cliente, `select public.site_health_record('[]'::jsonb)`), /permission denied/);
await raises('a tabela não se lê pela API', () => as('authenticated', gestor, `select * from private.site_events`), /permission denied/);
await raises('um tipo inventado é recusado', () => svc(`select public.site_health_record($1::jsonb)`, [JSON.stringify([{ kind: 'outro', name: 'x' }])]), /site_events_kind_check/);
await raises('um valor negativo é recusado', () => svc(`select public.site_health_record($1::jsonb)`, [JSON.stringify([vital('LCP', -1)])]), /site_events_value_check/);

// --- 2. Quem lê --------------------------------------------------------------------------
const vitals = await as('authenticated', gestor, `select * from public.site_health_vitals(7)`);
const lcpMovel = vitals.find((r) => r.page === '/' && r.device === 'mobile' && r.name === 'LCP');
check('p75 do LCP no telemóvel, como o Google o calcula', lcpMovel && Math.round(lcpMovel.p75) === 3000, lcpMovel);
check('mediana e número de medições', lcpMovel && Math.round(lcpMovel.median) === 2600 && Number(lcpMovel.samples) === 5, lcpMovel);
check('telemóvel e computador em separado', vitals.some((r) => r.device === 'desktop' && r.name === 'LCP' && r.page === '/' && Number(r.samples) === 1));
const total = vitals.find((r) => r.page === '*' && r.device === 'mobile' && r.name === 'LCP');
check('uma linha com todas as páginas de cada aparelho', total && Number(total.samples) === 5 && Math.round(total.p75) === 3000, total);
check('os totais vêm primeiro', vitals[0]?.page === '*', vitals[0]);
const erros = await as('authenticated', gestor, `select * from public.site_health_errors(7)`);
check('os erros agrupam-se pela mensagem', erros.length === 1 && Number(erros[0].occurrences) === 2, erros);
check('com as páginas onde aconteceram', erros[0] && erros[0].pages.includes('/shop') && erros[0].pages.includes('/product/:id'), erros[0]?.pages);
check('e a versão da última vez', erros[0] && erros[0].sample?.source === '/assets/index.js', erros[0]?.sample);

await raises('quem só gere encomendas não lê', () => as('authenticated', vendas, `select * from public.site_health_vitals(7)`), /Sem permissão/);
await raises('um cliente não lê os erros', () => as('authenticated', cliente, `select * from public.site_health_errors(7)`), /Sem permissão/);
await raises('o anónimo não lê', () => as('anon', null, `select * from public.site_health_vitals(7)`), /permission denied/);

// --- 3. A janela e a limpeza --------------------------------------------------------------
await q(`update private.site_events set created_at = now() - interval '10 days' where name = 'INP'`);
const semana = await as('authenticated', gestor, `select * from public.site_health_vitals(7)`);
check('7 dias não mostram o que é mais antigo', !semana.some((r) => r.name === 'INP'));
const mes = await as('authenticated', gestor, `select * from public.site_health_vitals(30)`);
check('30 dias mostram', mes.some((r) => r.name === 'INP'));
const [job] = await q(`select command from cron.job where jobname = 'saude-limpeza'`);
check('a limpeza dos 30 dias está agendada', job && /30 days/.test(job.command), job);
await q(`update private.site_events set created_at = now() - interval '31 days' where name = 'CLS'`);
await q(job.command);
const [{ n }] = await q(`select count(*)::int n from private.site_events where name = 'CLS'`);
check('a limpeza apaga o que passou dos 30 dias', n === 0, n);

// O registo das execuções do pg_cron (migração limpeza_do_registo_do_cron): fica só duas semanas.
{
  const [cron] = await q(`select schedule, command from cron.job where jobname = 'limpeza-cron'`);
  check('a limpeza do registo do pg_cron está agendada, uma vez por dia', cron && cron.schedule === '53 3 * * *' && /14 days/.test(cron.command), cron);
  await q(`insert into cron.job_run_details (jobid, status, start_time, end_time) values
             (1, 'succeeded', now() - interval '20 days', now() - interval '20 days'),
             (1, 'failed', now() - interval '3 days', now() - interval '3 days'),
             (1, 'running', now(), null)`);
  await q(cron.command);
  const linhas = await q(`select status from cron.job_run_details order by runid`);
  check('apaga só as execuções com mais de 14 dias (e nunca as que estão a correr)', linhas.map((l) => l.status).join() === 'failed,running', linhas);
}

console.log(`saude: ${ok} certos, ${fail} falhados`);
if (fail) process.exit(1);
