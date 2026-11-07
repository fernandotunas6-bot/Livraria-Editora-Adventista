import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Feather, Flame, LayoutGrid, Search, ShieldCheck, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { POST_KINDS, SORTS, plural } from '@/lib/communityStyle';
import TopicIcon from '@/components/community/TopicIcon';

/** Filete dourado com um losango ao centro: o ornamento editorial da comunidade. */
export function GoldRule({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-editorial-ouro/70" />
      <span className="h-1.5 w-1.5 rotate-45 bg-editorial-ouro" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-editorial-ouro/70" />
    </div>
  );
}

/** Topo editorial: marinho, Fraunces, filete dourado e os números da comunidade. */
export function CommunityHero({ stats, onWrite }) {
  return (
    <section className="relative overflow-hidden bg-editorial-marinho pb-6 pt-20 text-white sm:pb-10 sm:pt-28">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #b8892f 0, transparent 40%), radial-gradient(circle at 80% 0%, #5fd0ea 0, transparent 35%)' }} />
      <div className="container-custom relative">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e2c27d]">Livraria Adventista</p>
        <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl md:text-5xl">Comunidade de Leitores</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80 sm:mt-3 sm:text-base md:text-lg">
          Converse sobre livros, a Bíblia e a vida. Cite uma passagem, faça uma pergunta, recomende uma leitura.
        </p>
        <GoldRule className="my-4 max-w-md sm:my-6" />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {stats && (
            <dl className="flex gap-6 text-sm sm:gap-8">
              <div><dt className="text-white/70">Leitores</dt><dd className="text-2xl font-semibold tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{stats.members || 0}</dd></div>
              <div><dt className="text-white/70">Publicações</dt><dd className="text-2xl font-semibold tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{stats.posts_total || 0}</dd></div>
              <div><dt className="text-white/70">Esta semana</dt><dd className="text-2xl font-semibold tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{stats.posts_week || 0}</dd></div>
            </dl>
          )}
          <Button type="button" onClick={onWrite} className="h-11 rounded-full bg-[#e2c27d] px-6 font-semibold text-editorial-marinho hover:bg-[#ecd39b]">
            <Feather className="mr-2 h-4 w-4" aria-hidden="true" /> Escrever
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Faixa do clube do livro do mês. */
export function ClubBanner({ club }) {
  if (!club) return null;
  const month = new Date(`${club.month}T12:00:00`).toLocaleDateString('pt-PT', { month: 'long' });
  return (
    <section aria-labelledby="clube-do-livro" className="overflow-hidden rounded-2xl border border-editorial-ouro/40 bg-gradient-to-br from-editorial-papel to-editorial-tela shadow-sm">
      <div className="flex items-start gap-4 p-4 sm:items-center sm:p-5">
        {club.book_cover && <img src={club.book_cover} alt={`Capa de ${club.book_title}`} className="h-28 w-[4.5rem] shrink-0 rounded-md object-cover shadow-md sm:h-36 sm:w-24" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-editorial-ouro-texto">Clube do livro · {month}</p>
          <h2 id="clube-do-livro" className="mt-1 text-xl font-semibold text-editorial-tinta sm:text-2xl">{club.title || club.book_title}</h2>
          <p className="text-sm text-editorial-tinta-suave">{club.book_title}{club.book_author ? ` · ${club.book_author}` : ''}</p>
          {club.intro && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-editorial-tinta sm:line-clamp-3">{club.intro}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="bg-editorial-petroleo hover:bg-editorial-petroleo/90">
              <Link to={`/comunidade?livro=${encodeURIComponent(club.book_id)}`}>Entrar na discussão</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="border-editorial-filete bg-editorial-papel">
              <Link to={`/product/${club.book_id}`}>Ver o livro</Link>
            </Button>
            <span className="text-xs text-editorial-tinta-suave">{plural(club.posts_count || 0, 'publicação', 'publicações')} este mês</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Temas: lista fixa à esquerda no computador, chips que deslizam no telemóvel. */
export function TopicNav({ topics = [], active = '', onChange, counts = {} }) {
  const item = (slug, label, icon) => {
    const on = active === slug;
    return (
      <button
        key={slug || 'todos'}
        type="button"
        onClick={() => onChange(slug)}
        aria-pressed={on}
        className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors lg:w-full lg:rounded-xl ${on
          ? 'bg-editorial-marinho font-semibold text-white'
          : 'bg-editorial-papel text-editorial-tinta hover:bg-editorial-filete/50 lg:bg-transparent'}`}
      >
        {icon}
        <span className="truncate">{label}</span>
        {slug && counts[slug] > 0 && <span className={`ml-auto text-xs tabular-nums ${on ? 'text-white/80' : 'text-editorial-tinta-suave'}`}>{counts[slug]}</span>}
      </button>
    );
  };
  return (
    <nav aria-label="Temas da comunidade">
      <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-[0.18em] text-editorial-tinta-suave lg:block">Temas</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
        {item('', 'Todos os temas', <LayoutGrid className="h-4 w-4" aria-hidden="true" />)}
        {topics.map((t) => item(t.slug, t.name, <TopicIcon name={t.icon} />))}
      </div>
    </nav>
  );
}

/** Ordenação, tipos e pesquisa do feed. */
export function FeedToolbar({ filters, onChange }) {
  const [query, setQuery] = useState(filters.query || '');
  useEffect(() => { setQuery(filters.query || ''); }, [filters.query]);
  const submit = (e) => { e.preventDefault(); onChange({ query: query.trim() }); };
  const chip = (on) => `min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:min-h-0 ${on
    ? 'border-editorial-petroleo bg-editorial-petroleo text-white'
    : 'border-editorial-filete bg-editorial-papel text-editorial-tinta hover:bg-editorial-tela'}`;

  return (
    <div className="space-y-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Ordenar publicações" className="flex rounded-full bg-editorial-tela p-1">
          {SORTS.map((s) => (
            <button
              key={s.value} type="button" role="tab" aria-selected={filters.sort === s.value}
              onClick={() => onChange({ sort: s.value })}
              className={`flex min-h-9 items-center gap-1 rounded-full px-3.5 py-1.5 text-sm transition-colors ${filters.sort === s.value ? 'bg-editorial-papel font-semibold text-editorial-tinta shadow-sm' : 'text-editorial-tinta-suave hover:text-editorial-tinta'}`}
            >
              {s.value === 'em_alta' && <Flame className="h-3.5 w-3.5" aria-hidden="true" />}
              {s.label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} role="search" className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-editorial-tinta-suave" aria-hidden="true" />
          <Input
            aria-label="Pesquisar na comunidade" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar na comunidade" className="h-10 rounded-full bg-editorial-papel pl-9 pr-9"
          />
          {query && (
            <button type="button" aria-label="Limpar a pesquisa" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-editorial-tinta-suave hover:bg-editorial-tela" onClick={() => { setQuery(''); onChange({ query: '' }); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de publicação">
        <button type="button" className={chip(!filters.kind)} aria-pressed={!filters.kind} onClick={() => onChange({ kind: '' })}>Tudo</button>
        {POST_KINDS.map((k) => (
          <button key={k.value} type="button" className={chip(filters.kind === k.value)} aria-pressed={filters.kind === k.value} onClick={() => onChange({ kind: filters.kind === k.value ? '' : k.value })}>
            {k.plural}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Coluna lateral: livros em discussão, temas em alta e as regras. */
export function CommunitySidebar({ sidebar }) {
  const books = sidebar?.books || [];
  const trending = (sidebar?.topics || []).filter((t) => t.posts > 0).sort((a, b) => b.posts - a.posts).slice(0, 5);
  return (
    <aside className="hidden space-y-4 lg:block" aria-label="Destaques da comunidade">
      {books.length > 0 && (
        <section className="rounded-2xl border border-editorial-filete bg-editorial-papel p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-editorial-tinta"><BookOpen className="h-4 w-4 text-editorial-ouro" aria-hidden="true" /> Livros em discussão</h2>
          <GoldRule className="my-3" />
          <ul className="space-y-3">
            {books.map((b) => (
              <li key={b.id}>
                <Link to={`/comunidade?livro=${encodeURIComponent(b.id)}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-editorial-tela">
                  {b.cover ? <img src={b.cover} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover shadow-sm" /> : <span className="h-14 w-10 shrink-0 rounded bg-editorial-tela" aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-editorial-tinta">{b.title}</span>
                    <span className="block text-xs text-editorial-tinta-suave">{plural(b.posts, 'publicação', 'publicações')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {trending.length > 0 && (
        <section className="rounded-2xl border border-editorial-filete bg-editorial-papel p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-editorial-tinta"><Flame className="h-4 w-4 text-editorial-ouro" aria-hidden="true" /> Temas em alta</h2>
          <GoldRule className="my-3" />
          <ul className="space-y-1">
            {trending.map((t) => (
              <li key={t.slug}>
                <Link to={`/comunidade?tema=${encodeURIComponent(t.slug)}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-editorial-tinta hover:bg-editorial-tela">
                  <TopicIcon name={t.icon} /> <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-xs tabular-nums text-editorial-tinta-suave">{t.posts}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-2xl border border-editorial-filete bg-editorial-papel p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-editorial-tinta"><ShieldCheck className="h-4 w-4 text-editorial-ouro" aria-hidden="true" /> Regras da casa</h2>
        <GoldRule className="my-3" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-editorial-tinta">
          <li>Respeito, sempre. Discorde das ideias, não das pessoas.</li>
          <li>Nas citações, indique o livro e a página.</li>
          <li>Sem links para conteúdo adulto, encurtadores ou sites perigosos.</li>
          <li>Três denúncias ocultam uma publicação até a equipa a rever.</li>
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-editorial-tinta-suave"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Publica com o nome do seu perfil.</p>
        <Link to="/privacidade#comunidade" className="mt-1.5 inline-block text-xs font-semibold text-editorial-petroleo underline underline-offset-2">O que fica público e como apagar</Link>
      </section>
    </aside>
  );
}

/**
 * Telemóvel: o que no computador está na coluna lateral, antes do feed. Lá em baixo ficava
 * inalcançável, porque o feed carrega mais publicações ao chegar ao fim.
 */
export function MobileHighlights({ sidebar }) {
  const books = sidebar?.books || [];
  return (
    <div className="space-y-3 lg:hidden">
      {books.length > 0 && (
        <section aria-labelledby="livros-em-discussao-m">
          <h2 id="livros-em-discussao-m" className="mb-2 flex items-center gap-2 text-sm font-semibold text-editorial-tinta">
            <BookOpen className="h-4 w-4 text-editorial-ouro" aria-hidden="true" /> Livros em discussão
          </h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {books.map((b) => (
              <li key={b.id} className="shrink-0">
                <Link to={`/comunidade?livro=${encodeURIComponent(b.id)}`} className="flex w-56 items-center gap-3 rounded-xl border border-editorial-filete bg-editorial-papel p-2">
                  {b.cover ? <img src={b.cover} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover shadow-sm" /> : <span className="h-14 w-10 shrink-0 rounded bg-editorial-tela" aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-editorial-tinta">{b.title}</span>
                    <span className="block text-xs text-editorial-tinta-suave">{plural(b.posts, 'publicação', 'publicações')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="group rounded-2xl border border-editorial-filete bg-editorial-papel">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-editorial-tinta [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="h-4 w-4 text-editorial-ouro" aria-hidden="true" /> Regras da casa
          <span className="ml-auto text-xs font-normal text-editorial-tinta-suave group-open:hidden">Ver</span>
          <span className="ml-auto hidden text-xs font-normal text-editorial-tinta-suave group-open:inline">Fechar</span>
        </summary>
        <div className="px-4 pb-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-editorial-tinta">
            <li>Respeito, sempre. Discorde das ideias, não das pessoas.</li>
            <li>Nas citações, indique o livro e a página.</li>
            <li>Sem links para conteúdo adulto, encurtadores ou sites perigosos.</li>
            <li>Três denúncias ocultam uma publicação até a equipa a rever.</li>
          </ul>
          <Link to="/privacidade#comunidade" className="mt-2 inline-block text-xs font-semibold text-editorial-petroleo underline underline-offset-2">O que fica público e como apagar</Link>
        </div>
      </details>
    </div>
  );
}
