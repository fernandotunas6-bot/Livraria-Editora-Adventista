# Migrações pendentes

Esta pasta guarda SQL que ainda **não** pode ir para `supabase/migrations`: lá só entram
migrações que se podem aplicar tal como estão (o Actions corre `supabase db push` no merge
para o `main`, e depois publica a Edge Function).

Hoje não há nenhuma. O que estava aqui, e para onde foi (2026-11-04):

| Ficheiro | Destino |
|---|---|
| `1_loja_talatona_para_huambo.sql` | **Retirado.** O id que alterava é hoje a loja de Catumbela, e a do Huambo já existe (`tlp93hkif52qxmy`): correr o SQL criava uma segunda loja do Huambo. Fica no histórico do git. |
| `2_capas_das_colecoes.sql` | `supabase/migrations/20261105045517_capas_das_colecoes.sql`, com o domínio novo e só onde a capa ainda é do Unsplash. |
| `2_painel_vendas_por_loja.sql` | Aplicada a 2026-11-01 (`20261101205332`). |
| `3_utilizadores_rpc.sql` | Aplicada a 2026-11-01 (`20261101212413`). |
| `3_indices_chaves_estrangeiras.sql` | `20261104090000`, aplicada. |
| `4_centro_atendimento_notificacoes.sql` | Aplicada a 2026-11-03 (`20261103165632`). |
| `4_campos_encomendas.sql` | `supabase/migrations/20261105045510_campos_encomendas.sql`. O site publicado já tem o código de que depende. |

## Passo seguinte, ainda sem ficheiro: apagar as colunas herdadas das encomendas

`payment_method`, `payment_category`, `address` e `city`. Só depois de:

1. ~~a `20261105045510_campos_encomendas` estar aplicada~~ (aplicada a 2026-11-05) e a Edge Function publicada;
2. o site deixar de pedir essas colunas (`ORDER_LIST_FIELDS` no `AdminPage.jsx`) e de as usar
   como recurso em `orderUtils.js` / `orderFields.ts`;
3. o trigger `orders_before_update` deixar de ler `new.city`.

Um `select` de uma coluna que já não existe faz o PostgREST recusar o pedido e parte a lista
de encomendas do painel.
