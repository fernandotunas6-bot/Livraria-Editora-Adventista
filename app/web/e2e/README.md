# Testes de ponta a ponta — fluxo de compra e página das lojas

Um navegador a sério (Chromium, pelo Playwright) faz o caminho de quem compra: catálogo → livro →
carrinho → dados e pagamento → página de sucesso → rastreio → confirmação de recepção
(`compra.spec.js`). À parte, `lojas.spec.js` cobre a página das lojas físicas, onde o que
interessa provar no navegador são as fotografias: que abrem em grande e que não são
descarregadas em tamanho grande sem necessidade. Corre em dois tamanhos, computador e telemóvel
(`playwright.config.js`).

```bash
npm run test:e2e                      # na raiz do repositório
npx playwright test --ui              # em app/web: escolher e ver os testes a correr
npx playwright test -g "levantamento" # só os testes com este texto no nome
```

Na primeira vez, numa máquina sem o navegador: `npx playwright install chromium` (em `app/web`).
No CI corre no job **Fluxo de compra (Playwright)** do `ci.yml`, em cada pull request.

## O que é verdadeiro e o que é falso

- **Verdadeiro:** o site. É o build de produção (`vite build`), servido pelo `vite preview`.
- **Falso:** o Supabase. O build aponta para `https://supabase.e2e.invalid`, que não existe, e o
  `lojaFalsa.js` responde a esses pedidos na rede do navegador, com uma loja em memória por teste
  (catálogo, stock, encomendas). Nenhum teste toca a base de dados de produção, e não são precisos
  segredos nem `.env`.

A loja falsa segue as regras que interessam à compra: calcula o total no servidor, desce o stock,
devolve a mesma encomenda quando a chave de idempotência se repete, e só mostra o rastreio a quem
tem o número e o email. As regras a sério (o `place_order`, os gatilhos, a RLS) continuam testadas
contra as migrações reais em `scripts/pglite/`. Aqui prova-se a ligação entre os ecrãs e o pedido
que sai do navegador.

Tudo o que não é o site nem a loja falsa (fontes da Google, mapas) é cortado: os testes não
dependem da internet.

## Cenários

| Teste | O que prova |
|---|---|
| Compra sem conta, com entrega | O caminho inteiro, até à assinatura de quem recebe; o carrinho fica vazio depois de comprar |
| O que falta é dito junto de cada campo | Sem dados, nada segue para o servidor |
| Levantamento na loja | Sem morada nem portes; a loja é obrigatória; «Pagar no Balcão» só aqui |
| Transferência | Fica «registada», não «confirmada»; a nota de encomenda diz o estado do pagamento |
| Localização partilhada | As coordenadas e a precisão chegam ao servidor |
| O stock acabou entretanto | A recusa do servidor aparece e o formulário fica como estava |
| A rede cai depois de o servidor gravar | A segunda tentativa não cria outra encomenda |
| Carregar duas vezes em «Confirmar» | Uma encomenda só |
| Rastreio com o email de outra pessoa | Não abre |
| Fotografias da loja | Abrem em grande, com legenda, e as setas andam na galeria |
| Fotografias no rodapé | Só descem quando se chega ao rodapé, e na variante de 480 px |
| Painel de Vendas de uma loja (`painel-vendas.spec.js`) | Compilado como em produção, desenha os três gráficos, o quadro geral e os meses, com e sem «reduzir movimento», sem erros |

O Painel de Vendas corre no `/admin`, atrás de sessão e permissões. O teste não passa pelo login:
abre a página de teste `e2e/painel/`, que monta o mesmo `mountPainel` com uma api em memória e é
compilada à parte pelo `vite build` (segundo servidor no `playwright.config.js`, porta 4174). O que
se prova é o build: em Novembro de 2026 o painel parou em produção porque o tree-shaking tirou o
`.transition()` do d3, com todos os testes unitários verdes.

## Ao mudar o fluxo de compra

- Uma rota nova da API usada na compra tem de existir em `lojaFalsa.js`. Sem ela o teste falha no
  fim com «rotas da API pedidas que a loja falsa não conhece», em vez de o site receber um 404
  calado.
- Os testes procuram os campos pelo rótulo e os botões pelo nome, como quem usa a página. Mudar um
  texto visível obriga a mudar o teste: é de propósito.
- Quando um teste falha no CI, o relatório (capturas e traço) fica nos artefactos da execução.
