# Auditoria visual — site do PR #98 (ce87793), servido no runner

2026-11-20 16:30 UTC · 13 páginas × 5 larguras · capturas em `capturas/<página>/<largura>.jpg` (e `-inteira.jpg` a 390 e 1280 px)

Telemóvel: 390 px, rede e processador travados (latência 150 ms, 1,6 Mbit/s, CPU 4×). Computador: 1280 px, sem travões. Objectivos: LCP ≤ 2,5 s · CLS ≤ 0,1. Medições de laboratório, a partir do GitHub.

| Página | LCP telemóvel | CLS telemóvel | LCP computador | CLS computador | TTFB | JS (KB) | Pedidos | axe (telemóvel/computador) | 1.º Tab |
|---|---|---|---|---|---|---|---|---|---|
| inicio | 4.51 s ❌ | 0.008 ✅ | 0.32 s ✅ | 0.005 ✅ | 4 ms | 476 | 146 | 0 / 0 | a «Saltar para o conteúdo» |
| loja | 4.89 s ❌ | 0.031 ✅ | 0.84 s ✅ | 0.043 ✅ | 3 ms | 489 | 123 | 0 / 0 | a «Saltar para o conteúdo» |
| livro | 5.28 s ❌ | 0 ✅ | 1.11 s ✅ | 0 ✅ | 3 ms | 455 | 123 | 0 / 0 | a «Saltar para o conteúdo» |
| colecoes | 4.54 s ❌ | 0 ✅ | 0.27 s ✅ | 0.005 ✅ | 5 ms | 387 | 80 | 0 / 0 | a «Saltar para o conteúdo» |
| lojas | 5.39 s ❌ | 0.001 ✅ | 0.82 s ✅ | 0.001 ✅ | 4 ms | 361 | 80 | 1 / 1 | a «Saltar para o conteúdo» |
| sobre | 5.46 s ❌ | 0.053 ✅ | 0.26 s ✅ | 0 ✅ | 4 ms | 344 | 60 | 0 / 0 | a «Saltar para o conteúdo» |
| contacto | 4.44 s ❌ | 0.003 ✅ | 0.26 s ✅ | 0.001 ✅ | 3 ms | 394 | 80 | 0 / 0 | a «Saltar para o conteúdo» |
| faq | 4.15 s ❌ | 0.003 ✅ | 0.26 s ✅ | 0.004 ✅ | 5 ms | 349 | 62 | 0 / 0 | a «Saltar para o conteúdo» |
| envios | 4.12 s ❌ | 0.002 ✅ | 0.25 s ✅ | 0.002 ✅ | 4 ms | 349 | 65 | 0 / 0 | a «Saltar para o conteúdo» |
| rastreio | 4.76 s ❌ | 0.002 ✅ | 0.28 s ✅ | 0.001 ✅ | 4 ms | 397 | 84 | 0 / 0 | a «Saltar para o conteúdo» |
| entrar | 3.50 s ⚠️ | 0.008 ✅ | 0.19 s ✅ | 0 ✅ | 4 ms | 283 | 42 | 0 / 0 | a «Esqueceu?» |
| comunidade | 3.99 s ⚠️ | 0.021 ✅ | 0.29 s ✅ | 0.001 ✅ | 4 ms | 393 | 84 | 0 / 0 | a «Saltar para o conteúdo» |
| pagina-inexistente | 2.19 s ✅ | 0.005 ✅ | 0.14 s ✅ | 0.001 ✅ | 4 ms | 267 | 26 | 0 / 0 | a «Ver o catálogoLivros, Bíblias, materiais» |

## O que mais pesa na página inicial (telemóvel)

| KB | Tipo | Recurso |
|---:|---|---|
| 105 | script | `/assets/index-CyVziAck.js` |
| 76 | img | `/images/capas/kigest/em-busca-de-esperanca.webp` |
| 64 | img | `/images/capas/kigest/profecias-surpreendentes.webp` |
| 59 | script | `/assets/vendor-react-CJ3BZQT2.js` |
| 58 | script | `/assets/vendor-supabase-D2ifPpM8.js` |
| 56 | img | `/images/capas/novos/a-fe-de-jesus-guia-de-estudos-para-a-classe-baptismal.jpg` |
| 54 | img | `/images/capas/novos/biblia-sagrada-capa-dura-castanha.jpg` |
| 53 | img | `/images/site/960/slide-catalogo.webp` |
| 51 | img | `/images/capas/kigest/conecte-se-com-seu-filho.webp` |
| 50 | font | `/assets/source-serif-4-latin-wght-normal-DMe4EKeb.woff2` |
| 47 | font | `/assets/inter-latin-wght-normal-Dx4kXJAl.woff2` |
| 38 | css | `/assets/index-C-7xPJUX.css` |

## Acessibilidade (axe-core, WCAG 2.2 A/AA)

- **color-contrast** (serious): Elements must meet minimum color contrast ratio thresholds — 2 elementos em lojas@390, lojas@1280. Ex.: `.ml-auto`

## Títulos, canonical e dados estruturados (computador)

| Página | Estado | Título | Canonical | JSON-LD |
|---|---|---|---|---|
| inicio | 200 | Livros e Histórias — Livraria Adventista | https://livrariaadventista.ao/ | 1 |
| loja | 200 | Todos os Livros — Livraria Adventista | https://livrariaadventista.ao/shop | 1 |
| livro | 200 | O Desejado de Todas as Nações — Livraria Adventista | https://livrariaadventista.ao/product/047fsrl1mka65wf | 2 |
| colecoes | 200 | Coleções — Livraria Adventista | https://livrariaadventista.ao/colecoes | 1 |
| lojas | 200 | Lojas físicas — Livraria Adventista | https://livrariaadventista.ao/lojas | 2 |
| sobre | 200 | Sobre Nós — Livraria Adventista | https://livrariaadventista.ao/about | 1 |
| contacto | 200 | Contacto — Livraria Adventista | https://livrariaadventista.ao/contact | 1 |
| faq | 200 | FAQ — Livraria Adventista | https://livrariaadventista.ao/faq | 1 |
| envios | 200 | Envios e Devoluções — Livraria Adventista | https://livrariaadventista.ao/shipping-returns | 1 |
| rastreio | 200 | Rastrear Encomenda — Livraria Adventista | https://livrariaadventista.ao/ | 1 |
| entrar | 200 | Entrar — Livraria Adventista | https://livrariaadventista.ao/ | 1 |
| comunidade | 200 | Comunidade de Leitores — Livraria Adventista | https://livrariaadventista.ao/comunidade | 1 |
| pagina-inexistente | 200 | Página não encontrada — Livraria Adventista | https://livrariaadventista.ao/ | 1 |

## Problemas encontrados

Nenhum.
