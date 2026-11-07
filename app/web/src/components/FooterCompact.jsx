import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, MapPin, MessageCircle, PackageSearch, ShieldCheck, Truck } from 'lucide-react';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { BRAND } from '@/lib/brand';

/**
 * Rodapé do telemóvel para as páginas de catálogo.
 *
 * A página inicial, a loja, as categorias e as colecções escondem o rodapé no telemóvel
 * (`hidden md:block`), com o argumento de que a barra inferior leva às mesmas páginas. Leva a
 * algumas — Início, Categorias, Pesquisar, Carrinho, Conta — e a mais nenhuma. Tudo o resto
 * só existia no rodapé, e num mercado em que quase todo o tráfego entra pelo telemóvel isso
 * queria dizer que a maioria das visitas nunca via:
 *
 * - a **política de privacidade** (a única ligação para ela no site está no rodapé);
 * - os **métodos de pagamento** aceites e o **limiar dos portes grátis**, que são argumentos
 *   de compra e não detalhes administrativos;
 * - as **lojas físicas** e o levantamento sem portes;
 * - **rastrear uma encomenda** e **falar com a livraria**.
 *
 * Então em vez de nada, o essencial, numa altura que não compete com a lista de livros: as
 * garantias em duas linhas, os links que faltam e os direitos. O rodapé completo (newsletter,
 * três colunas de links, lojas com mapa) continua a ser só do computador — no telemóvel são
 * mais de dois ecrãs de rolagem no fim de uma lista infinita, e foi por isso que o tiraram.
 */
export default function FooterCompact() {
  const { settings } = useSiteSettings();
  const portesGratis = Number(settings.shipping_free_threshold) || 0;
  const whatsapp = String(settings.whatsapp || settings.contact_phone || '').replace(/\D/g, '');
  const copyright = settings.footer_copyright
    || `© ${new Date().getFullYear()} ${settings.site_name || BRAND.name}`;

  const atalho = 'flex items-center gap-2 rounded-xl border border-background/15 bg-background/5 px-3 py-2.5 text-sm text-background/85 transition-colors active:bg-background/15';

  return (
    // O espaço no fim é a barra de navegação inferior: sem ele, os últimos links ficavam
    // debaixo dela e não se conseguia tocar neles.
    <footer
      className="bg-foreground text-background md:hidden"
      style={{ paddingBottom: 'var(--barra-navegacao-total, 0px)' }}
    >
      <div className="container-custom py-8">
        <ul className="mb-5 space-y-2 text-sm text-background/75">
          <li className="flex gap-2.5">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
            <span>
              Entrega em todo o país
              {portesGratis > 0 && <> · portes grátis acima de {portesGratis.toLocaleString('pt-AO')} Kz</>}
            </span>
          </li>
          <li className="flex gap-2.5">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
            <span>Pagamento na entrega, transferência ou no balcão</span>
          </li>
        </ul>

        <nav aria-label="Apoio ao cliente" className="grid grid-cols-2 gap-2">
          <Link to="/track" className={atalho}>
            <PackageSearch className="h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
            Rastrear
          </Link>
          <Link to="/lojas" className={atalho}>
            <MapPin className="h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
            Lojas
          </Link>
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className={atalho}>
              <MessageCircle className="h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
              WhatsApp
            </a>
          ) : (
            <Link to="/contact" className={atalho}>
              <MessageCircle className="h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
              Contactos
            </Link>
          )}
          <Link to="/shipping-returns" className={atalho}>
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#22d3ee]" aria-hidden="true" />
            Devoluções
          </Link>
        </nav>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-background/20 pt-4 text-center">
          <p className="text-xs text-background/70">{copyright}</p>
          <Link to="/privacidade" className="text-xs text-background/70 underline underline-offset-2">
            Política de privacidade
          </Link>
          <Link to="/faq" className="text-xs text-background/70 underline underline-offset-2">
            Perguntas frequentes
          </Link>
        </div>
      </div>
    </footer>
  );
}
