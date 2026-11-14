import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { pageTitle } from '@/lib/brand';
import { verifyColporteur } from '@/lib/colporteurApi';
import { CATEGORIES } from '@/lib/colporteurCommission';

const dataPt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-AO') : '—');

/** O que a verificação respondeu, em português, com a cor e o ícone. */
export function veredicto(r) {
  if (!r) return null;
  if (!r.found) return { tom: 'mau', titulo: 'Cartão não reconhecido', texto: 'O código do colportor e o código de verificação não correspondem a nenhum cartão. Confirme que os escreveu como estão no verso do cartão. Um cartão reemitido invalida o anterior.' };
  if (r.valid) return { tom: 'bom', titulo: 'Cartão válido', texto: `${r.full_name} é colportor activo da Livraria Adventista.` };
  if (r.status !== 'activo') return { tom: 'mau', titulo: 'Este colportor não está activo', texto: `${r.full_name} já não está activo como colportor (${r.status === 'suspenso' ? 'suspenso' : 'inactivo'}). Não aceite vendas em nome da Livraria.` };
  return { tom: 'aviso', titulo: 'Cartão caducado', texto: `O cartão de ${r.full_name} caducou a ${dataPt(r.valid_until)}. O colportor continua activo, mas deve pedir um cartão novo.` };
}

/**
 * Verificação pública do cartão de colportor: /colportor/verificar/CPT-0007?k=ABCD1234 (o QR do
 * cartão) ou à mão, com o código do colportor e o código de verificação do verso. Só responde com
 * os dois certos, e nunca mostra o telefone (colporteur_verify).
 */
export default function ColporteurVerifyPage() {
  const { codigo = '' } = useParams();
  const [params] = useSearchParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [code, setCode] = useState(codigo);
  const [check, setCheck] = useState(params.get('k') || '');
  const [estado, setEstado] = useState({ loading: false, r: null, erro: '' });

  const verificar = async (c = code, k = check) => {
    if (!c.trim() || !k.trim()) { setEstado({ loading: false, r: null, erro: 'Escreva o código do colportor (CPT-…) e o código de verificação do verso do cartão.' }); return; }
    setEstado({ loading: true, r: null, erro: '' });
    try {
      const r = await verifyColporteur(c.trim(), k.trim());
      setEstado({ loading: false, r, erro: '' });
    } catch (e) {
      setEstado({ loading: false, r: null, erro: e.message || 'Não foi possível verificar agora. Tente de novo.' });
    }
  };
  // Pelo QR: os dois códigos vêm no endereço e verifica-se logo.
  useEffect(() => {
    if (codigo && params.get('k')) verificar(codigo, params.get('k'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const v = veredicto(estado.r);
  const r = estado.r;
  const Icone = v ? (v.tom === 'bom' ? ShieldCheck : v.tom === 'aviso' ? ShieldAlert : ShieldX) : null;
  const tons = { bom: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100', aviso: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100', mau: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100' };
  return (
    <>
      <Helmet>
        <title>{pageTitle('Verificar colportor')}</title>
        <meta name="description" content="Confirme se o cartão de um colportor da Livraria Adventista é válido." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="bg-background">
        <section className="border-b border-border bg-linear-to-b from-primary/10 to-background">
          <div className="container mx-auto max-w-2xl px-4 py-10 sm:py-14">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Evangelismo pela literatura</p>
            <h1 className="mb-3 text-3xl font-bold sm:text-4xl">Verificar um colportor</h1>
            <p className="text-lg text-muted-foreground">Os colportores da Livraria Adventista têm um cartão com um QR. Aponte a câmara ao QR, ou escreva aqui os dois códigos do cartão.</p>
          </div>
        </section>
        <section className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
          <form className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); verificar(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="v-code">Código do colportor</Label>
              <Input id="v-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CPT-0007" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-check">Código de verificação</Label>
              <Input id="v-check" value={check} onChange={(e) => setCheck(e.target.value.toUpperCase())} placeholder="ABCD-1234" autoComplete="off" className="font-mono tracking-wider" />
            </div>
            <Button type="submit" disabled={estado.loading}>{estado.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}Verificar</Button>
          </form>
          {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
          {v && (
            <div className={`rounded-2xl border p-5 ${tons[v.tom]}`} role="status">
              <p className="flex items-center gap-2 text-xl font-bold"><Icone className="h-6 w-6" aria-hidden="true" />{v.titulo}</p>
              <p className="mt-1">{v.texto}</p>
              {r && r.found && (
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="opacity-70">Nome</dt><dd className="font-semibold">{r.full_name}</dd></div>
                  <div><dt className="opacity-70">Código</dt><dd className="font-mono font-semibold">{r.code}</dd></div>
                  <div><dt className="opacity-70">Categoria</dt><dd className="font-semibold">{CATEGORIES[r.category]?.label || r.category}</dd></div>
                  <div><dt className="opacity-70">Igreja</dt><dd className="font-semibold">{[r.church, r.district, r.field].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt className="opacity-70">Cartão válido até</dt><dd className="font-semibold">{dataPt(r.valid_until)}</dd></div>
                  {r.start_date && <div><dt className="opacity-70">Colportor desde</dt><dd className="font-semibold">{dataPt(r.start_date)}</dd></div>}
                </dl>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Tem dúvidas sobre um colportor? <Link to="/contact" className="text-primary hover:underline">Fale connosco</Link>. Quer ser colportor? <Link to="/colportor/candidatura" className="text-primary hover:underline">Candidate-se</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
