import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Clock, HeartHandshake, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { pageTitle } from '@/lib/brand';
import { loadApplicationDirectory, submitApplication } from '@/lib/colporteurApi';
import { CATEGORIES } from '@/lib/colporteurCommission';
import { NativeSelect } from '@/components/admin/igreja/registryUi';

const EMPTY = {
  full_name: '', phone: '', email: '', province_id: '', municipality_id: '', church_id: '', church_other: '',
  pastor_id: '', pastor_name: '', requested_category: 'aspirante', weekly_hours: '', is_student: false, school: '',
  motivation: '', consent: false, website: '',
};
const APPLY_CATEGORIES = ['aspirante', 'estudante', 'tempo_parcial'];

/**
 * Candidatura a colportor — o link próprio para quem se quer tornar colportor
 * (/colportor/candidatura, e ?igreja=<nº> para os pastores partilharem já com a igreja).
 * Não precisa de conta: a equipa aprova e envia depois o convite para ligar a conta.
 */
export default function ColporteurApplyPage() {
  const [params] = useSearchParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [dir, setDir] = useState(null);
  const [dirError, setDirError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [notListed, setNotListed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    loadApplicationDirectory().then((d) => {
      setDir(d);
      const cn = params.get('igreja');
      const church = cn && d.churches.find((c) => String(c.cn) === cn);
      if (church) setForm((f) => ({ ...f, church_id: church.id, province_id: church.province_id || '', municipality_id: church.municipality_id || '' }));
    }).catch((e) => setDirError(e.message));
  }, [params]);

  const provincesWithChurches = useMemo(() => (dir ? dir.provinces.filter((p) => dir.churches.some((c) => c.province_id === p.id)) : []), [dir]);
  const churchList = useMemo(() => (dir ? dir.churches.filter((c) => !form.province_id || c.province_id === form.province_id)
    .filter((c) => !form.municipality_id || c.municipality_id === form.municipality_id) : []), [dir, form.province_id, form.municipality_id]);
  const church = dir?.churches.find((c) => c.id === form.church_id);
  const pastorList = useMemo(() => (dir && church ? dir.pastors.filter((p) => p.district_id === church.district_id) : []), [dir, church]);
  const municipalities = dir ? dir.municipalities.filter((m) => m.province === form.province_id) : [];

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const phone = form.phone.replace(/\D/g, '').replace(/^244(?=9\d{8}$)/, '');
    if (form.full_name.trim().length < 3) return setError('Indique o nome completo.');
    if (!/^9\d{8}$/.test(phone)) return setError('O telefone tem 9 algarismos e começa por 9 (ex.: 923 456 789).');
    if (!form.church_id && form.church_other.trim().length < 2) return setError('Escolha a sua igreja ou escreva o nome.');
    if (!form.consent) return setError('Para continuar, aceite que a Livraria use estes dados para tratar a candidatura.');
    setSending(true);
    try {
      const out = await submitApplication({
        ...form,
        phone,
        church_id: notListed ? '' : form.church_id,
        church_other: notListed ? form.church_other : '',
        weekly_hours: form.weekly_hours === '' ? null : Number(form.weekly_hours),
      });
      setDone(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle('Ser colportor')}</title>
        <meta name="description" content="Candidate-se a colportor da Livraria Adventista: leve livros que transformam vidas às famílias da sua zona." />
      </Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="bg-background">
        <section className="border-b border-border bg-linear-to-b from-primary/10 to-background">
          <div className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Evangelismo pela literatura</p>
            <h1 className="mb-3 text-3xl font-bold sm:text-4xl">Quer ser colportor?</h1>
            <p className="text-lg text-muted-foreground">
              O colportor leva às famílias da sua zona livros de saúde, família e esperança, e ganha uma percentagem de cada venda. Pode ser a tempo inteiro, nas horas livres ou nas férias, se for estudante.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[[BookOpen, 'Livros da Livraria', 'Recebe os livros à consignação ou compra-os com desconto.'],
                [Clock, 'No seu ritmo', 'Tempo inteiro, parcial ou plano de estudante.'],
                [HeartHandshake, 'Com a sua igreja', 'O pastor do seu distrito acompanha e recomenda.']].map(([Icon, t, d]) => (
                <div key={t} className="rounded-xl border border-border bg-background p-4">
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto max-w-3xl px-4 py-10">
          {done ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/40">
              <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
              <h2 className="mb-2 text-xl font-bold">Candidatura recebida</h2>
              <p className="mb-4">{done.message}</p>
              <ol className="mb-6 list-decimal space-y-1 pl-5 text-sm">
                <li>A equipa confirma a recomendação com o pastor do seu distrito.</li>
                <li>Quando for aprovado, recebe pelo WhatsApp o seu código de colportor (CPT-…) e um link para a sua área.</li>
                <li>Na área do colportor vê as suas percentagens e, mais tarde, os livros, os relatórios e os pagamentos.</li>
              </ol>
              <Button asChild variant="outline"><Link to="/">Voltar à loja</Link></Button>
            </div>
          ) : dirError ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{dirError}</p>
          ) : !dir ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !dir.open ? (
            <div className="rounded-xl border border-border p-6">
              <h2 className="mb-2 text-xl font-bold">Candidaturas fechadas de momento</h2>
              <p className="text-muted-foreground">{dir.note || 'Fale com o pastor do seu distrito ou com a Livraria para saber quando reabrem.'}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-8" noValidate>
              {dir.note && <p className="rounded-xl bg-muted/60 p-4 text-sm">{dir.note}</p>}

              <fieldset className="space-y-4">
                <legend className="mb-2 text-lg font-bold">1. Os seus dados</legend>
                <div className="space-y-1.5"><Label htmlFor="cp-nome">Nome completo *</Label>
                  <Input id="cp-nome" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} maxLength={120} autoComplete="name" required /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="cp-tel">Telefone (WhatsApp) *</Label>
                    <Input id="cp-tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="923 456 789" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="cp-email">Email (opcional)</Label>
                    <Input id="cp-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" maxLength={160} /></div>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="mb-2 flex items-center gap-2 text-lg font-bold"><MapPin className="h-5 w-5" />2. A sua igreja</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="cp-prov">Província</Label>
                    <NativeSelect id="cp-prov" value={form.province_id} onChange={(v) => set({ province_id: v, municipality_id: '', church_id: '', pastor_id: '' })}>
                      <option value="">— todas —</option>
                      {(notListed ? dir.provinces : provincesWithChurches).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </NativeSelect></div>
                  <div className="space-y-1.5"><Label htmlFor="cp-mun">Município</Label>
                    <NativeSelect id="cp-mun" value={form.municipality_id} onChange={(v) => set({ municipality_id: v, church_id: '', pastor_id: '' })} disabled={!form.province_id}>
                      <option value="">— {form.province_id ? 'todos' : 'escolha a província'} —</option>
                      {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </NativeSelect></div>
                </div>
                {!notListed ? (
                  <div className="space-y-1.5"><Label htmlFor="cp-igreja">Igreja *</Label>
                    <NativeSelect id="cp-igreja" value={form.church_id} onChange={(v) => {
                      const c = dir.churches.find((x) => x.id === v);
                      set({ church_id: v, pastor_id: '', province_id: c?.province_id || form.province_id, municipality_id: c?.municipality_id || form.municipality_id });
                    }}>
                      <option value="">— escolher —</option>
                      {churchList.map((c) => <option key={c.id} value={c.id}>{c.name}{c.district ? ` · ${c.district}` : ''}</option>)}
                    </NativeSelect></div>
                ) : (
                  <div className="space-y-1.5"><Label htmlFor="cp-outra">Nome da igreja *</Label>
                    <Input id="cp-outra" value={form.church_other} onChange={(e) => set({ church_other: e.target.value })} maxLength={120} placeholder="Igreja, distrito e localidade" /></div>
                )}
                <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => { setNotListed(!notListed); set({ church_id: '', pastor_id: '' }); }}>
                  {notListed ? 'Escolher da lista' : 'A minha igreja não está na lista'}
                </button>
                <div className="space-y-1.5"><Label htmlFor="cp-pastor">Pastor ou ancião que o recomenda</Label>
                  {pastorList.length > 0 && !notListed ? (
                    <NativeSelect id="cp-pastor" value={form.pastor_id} onChange={(v) => set({ pastor_id: v, pastor_name: '' })}>
                      <option value="">— escolher —</option>
                      {pastorList.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </NativeSelect>
                  ) : (
                    <Input id="cp-pastor" value={form.pastor_name} onChange={(e) => set({ pastor_name: e.target.value })} maxLength={120} placeholder="Nome do pastor ou ancião" />
                  )}
                  <p className="text-xs text-muted-foreground">A equipa confirma a recomendação com ele antes de aprovar.</p>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="mb-2 text-lg font-bold">3. Como quer trabalhar</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {APPLY_CATEGORIES.map((k) => (
                    <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm ${form.requested_category === k ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <input type="radio" name="cp-cat" className="sr-only" checked={form.requested_category === k} onChange={() => set({ requested_category: k, is_student: k === 'estudante' || form.is_student })} />
                      <span className="block font-semibold">{CATEGORIES[k].label}</span>
                      <span className="text-muted-foreground">{CATEGORIES[k].hint}</span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="cp-horas">Horas por semana (aproximado)</Label>
                    <Input id="cp-horas" type="number" min={0} max={80} value={form.weekly_hours} onChange={(e) => set({ weekly_hours: e.target.value })} /></div>
                  {(form.is_student || form.requested_category === 'estudante') && (
                    <div className="space-y-1.5"><Label htmlFor="cp-escola">Escola / universidade</Label>
                      <Input id="cp-escola" value={form.school} onChange={(e) => set({ school: e.target.value })} maxLength={120} /></div>
                  )}
                </div>
                <div className="space-y-1.5"><Label htmlFor="cp-mot">Porque quer ser colportor? (opcional)</Label>
                  <Textarea id="cp-mot" value={form.motivation} onChange={(e) => set({ motivation: e.target.value })} rows={3} maxLength={1000} /></div>
              </fieldset>

              {/* Isco para robôs: escondido de quem vê a página. */}
              <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="cp-site">Website</label>
                <input id="cp-site" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set({ website: e.target.value })} />
              </div>

              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={form.consent} onCheckedChange={(v) => set({ consent: v === true })} className="mt-0.5" />
                <span>Aceito que a Livraria Adventista use estes dados para tratar a candidatura e me contactar, e que os partilhe com o pastor do meu distrito (<Link to="/privacidade#colportagem" className="text-primary underline-offset-4 hover:underline">política de privacidade</Link>).</span>
              </label>

              {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" disabled={sending} className="w-full sm:w-auto">
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar candidatura
              </Button>
              <p className="text-sm text-muted-foreground">Já é colportor? <Link to="/colportor" className="text-primary hover:underline">Entre na sua área</Link>.</p>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
