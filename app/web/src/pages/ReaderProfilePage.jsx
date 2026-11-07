import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Award, BadgeCheck, ChevronRight, Loader2 } from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import Monogram from '@/components/community/Monogram';
import { GoldRule } from '@/components/community/CommunityParts';
import { isMissingTable, loadReader, loadReaderPosts } from '@/lib/communityApi';
import { plural, postKind, postPath, readerSince } from '@/lib/communityStyle';
import { relativeTime } from '@/lib/communityText';
import { pageTitle } from '@/lib/brand';

/** Perfil público de um leitor: nome, desde quando, actividade e publicações. Sem email nem foto. */
export default function ReaderProfilePage() {
  const { key } = useParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [reader, setReader] = useState(null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    Promise.all([loadReader(key), loadReaderPosts(key)])
      .then(([r, p]) => {
        if (!alive) return;
        if (!r) { setStatus('missing'); return; }
        setReader(r); setPosts(p); setStatus('ready');
      })
      .catch((e) => { if (alive) setStatus(isMissingTable(e) ? 'unavailable' : 'missing'); });
    return () => { alive = false; };
  }, [key]);

  const stats = reader ? [
    ['Publicações', reader.posts_count], ['Respostas', reader.replies_count],
    ['Gostos recebidos', reader.likes_received], ['Livros comentados', reader.books_count],
  ] : [];

  return (
    <>
      <Helmet>
        <title>{pageTitle(reader ? `${reader.author_name} — Comunidade` : 'Leitor — Comunidade')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="min-h-[60vh] bg-editorial-tela py-8">
        <div className="mx-auto w-full max-w-3xl px-4">
          <nav aria-label="Caminho" className="mb-4 flex items-center gap-1 text-sm text-editorial-tinta-suave">
            <Link to="/comunidade" className="hover:underline">Comunidade</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> <span>Leitor</span>
          </nav>

          {status === 'loading' && <div className="flex justify-center py-16" role="status" aria-label="A carregar o perfil"><Loader2 className="h-6 w-6 animate-spin text-editorial-tinta-suave" aria-hidden="true" /></div>}
          {status === 'missing' && (
            <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center">
              <h1 className="text-2xl font-semibold text-editorial-tinta">Leitor não encontrado</h1>
              <Link to="/comunidade" className="mt-3 inline-block font-semibold text-editorial-petroleo hover:underline">Voltar à comunidade</Link>
            </div>
          )}
          {status === 'unavailable' && <p className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center text-editorial-tinta-suave">A comunidade abre em breve.</p>}

          {status === 'ready' && reader && (
            <>
              <section className="overflow-hidden rounded-2xl border border-editorial-filete bg-editorial-papel shadow-sm">
                <div className="h-20 bg-editorial-marinho" aria-hidden="true" />
                <div className="-mt-10 px-5 pb-5">
                  <Monogram name={reader.author_name} authorKey={reader.author_key} size="lg" staff={reader.is_staff} />
                  <h1 className="mt-3 text-3xl font-semibold text-editorial-tinta">{reader.author_name}</h1>
                  <p className="text-sm text-editorial-tinta-suave">{readerSince(reader.since)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reader.is_staff && <span className="inline-flex items-center gap-1 rounded-full bg-editorial-tela px-2.5 py-1 text-xs font-semibold text-editorial-ouro-texto"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Equipa da Livraria</span>}
                    {reader.is_founder && <span className="inline-flex items-center gap-1 rounded-full bg-editorial-tela px-2.5 py-1 text-xs font-semibold text-editorial-ouro-texto"><Award className="h-3.5 w-3.5" aria-hidden="true" /> Membro fundador</span>}
                  </div>
                  <GoldRule className="my-4" />
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-editorial-tela p-3 text-center">
                        <dd className="text-2xl font-semibold tabular-nums text-editorial-tinta" style={{ fontFamily: "'Fraunces', serif" }}>{value || 0}</dd>
                        <dt className="text-xs text-editorial-tinta-suave">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>

              <section className="mt-8" aria-labelledby="publicacoes-do-leitor">
                <h2 id="publicacoes-do-leitor" className="text-2xl font-semibold text-editorial-tinta">Publicações</h2>
                {posts.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-8 text-center text-sm text-editorial-tinta-suave">Ainda sem publicações.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {posts.map((p) => (
                      <li key={p.id}>
                        <Link to={postPath(p.id)} className="block rounded-2xl border border-editorial-filete bg-editorial-papel p-4 transition-shadow hover:shadow-md">
                          <p className="text-xs font-semibold uppercase tracking-wide text-editorial-ouro-texto">{postKind(p.kind).label}{p.book_title ? ` · ${p.book_title}` : ''}</p>
                          <p className="mt-1 line-clamp-3 text-[15px] text-editorial-tinta">{p.body}</p>
                          <p className="mt-2 text-xs text-editorial-tinta-suave">{relativeTime(p.created)} · {plural(p.likes_count || 0, 'gosto', 'gostos')} · {plural(p.replies_count || 0, 'resposta', 'respostas')}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
