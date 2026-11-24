# Ensaio do KanGest Livraria numa loja

O guia para pôr à prova, passo a passo, tudo o que liga o KanGest Livraria ao site:
- o envio das facturas;
- a Loja online e a conta do site de cada pessoa;
- o tempo real;
- o funcionamento sem Internet;
- o navegador.

Cada passo diz o que deve ver e o que fazer se não vir. Faz-se depois dos merges, com o site em produção.

## Antes de começar

1. **Os PRs integrados, por esta ordem.**
   - Site: #102, #104, #106. As migrações têm de entrar por esta ordem.
   - KanGest: #101, #103, #105, #107, #108, #109. Ao integrar cada um, o seguinte passa a ter o `main` como base.
2. **As publicações** do Supabase e do Cloudflare a verde (`gh run list --branch main`).
3. **Um aviso sobre os documentos de ensaio.**
   - Os documentos que chegam à base central não se apagam (são cópias fiscais), e os de uma loja contam nas vendas
     dela.
   - Ligar um KanGest a outro posto volta a enviar tudo o que ele já emitiu.
   - Por isso o ensaio usa um **KanGest de ensaio** (empresa de teste), por esta ordem:
     1. ligado a um posto **com loja**, as encomendas, a conta do site e o tempo real, **sem emitir nenhum
        documento**;
     2. depois de desligado, ligado a um posto **sem loja**, as vendas e o «sem Internet». Esses documentos ficam na
        base em nome desse posto e não contam para nenhuma loja.
   - Só no fim se liga o KanGest da loja a sério.
4. **AGT.** Sem os segredos `KANGEST_AGT_*` no repositório, o instalador assina com a chave de desenvolvimento. Serve
   para o ensaio; não serve para facturar ao público.

## 1. As chaves (uma vez)

```bash
node scripts/kangest/chaves-sinc.mjs
```

Cole os dois comandos `npx supabase secrets set …` que o script mostra:
- `KANGEST_SINC_CHAVES` e `KANGEST_DADOS_CHAVE`;
- `KANGEST_CHAVE_PUBLICA_SITE`.

Guarde a `KANGEST_DADOS_CHAVE` num cofre de senhas.

- **Deve ver:** em Sistema → Ligação ao KanGest, a secção «Postos do KanGest Livraria» sem o aviso «Falta configurar as
  chaves».

## 2. O lado do site, sem instalar nada (posto de ensaio)

1. No painel, crie o posto **«Ensaio»**, sem loja, e copie o código e o endereço.
2. Corra o posto de ensaio:

   ```bash
   node scripts/kangest/ensaio-posto.mjs <endereço> <código>
   ```

- **Deve ver:** todos os passos com ✔:
  - o emparelhamento;
  - a chave pública e o tópico do tempo real;
  - a sincronização e a resposta selada;
  - as novidades;
  - «o mesmo pedido outra vez é recusado» e «uma assinatura errada é recusada».
- **Se não:**
  - a chave pública em falta é o `KANGEST_CHAVE_PUBLICA_SITE`;
  - o tópico em falta quer dizer que a migração `20261125120000` não está aplicada;
  - 404 quer dizer que faltam as chaves.
- **No fim:** no painel, **Revogar** o posto «Ensaio» deste passo (a chave dele só existiu no comando).

## 3. O instalador

No GitHub: **Actions → KanGest Livraria → Run workflow**, no `main`, com «Publicar o instalador no site». No fim da
corrida, descarregue-o no painel, em **Sistema → Ligação ao KanGest → Descarregar o KanGest Livraria**.

- **Deve ver:** a versão, o SHA-256, «Assinado com a chave das actualizações da edição» e, sem os segredos da AGT, o
  aviso âmbar «Versão de ensaio».
- **Se o «Publicar no site» falhar com «Falta a chave das actualizações»:** faltam os segredos
  `KANGEST_LIVRARIA_ACTUALIZACOES_*` e a variável `KANGEST_LIVRARIA_CHAVE_ACTUALIZACOES`
  ([KANGEST.md](KANGEST.md#descarregar-e-actualizar-o-kangest-livraria)).
- **Sem publicar no site:** «Gerar também o instalador do Windows» e, no fim da corrida, o artefacto
  `kangest-livraria-windows`.

## 4. O KanGest de ensaio, ligado a um posto com loja

1. Instale-o num computador de ensaio. Pode ficar ao lado do KanGest oficial: tem a sua pasta de dados.
2. Configure uma empresa de teste e um artigo com a referência de um livro do site (ex.: `LIV-001`). **Não emita
   nenhum documento** (nem entrada de stock) até ao passo 10.
3. No painel, crie o posto **«Ensaio — Huambo»**, com a loja.
4. No KanGest: **Livraria → Ligação ao site**, com o endereço e o código.

- **Deve ver:** «Ligado», e o nome do posto e da loja. Na barra de cima, o ponto verde «Livraria».

## 5. A Loja online

**Livraria → Loja online.**

- **Deve ver:** o catálogo do site em Produtos, com «0 nesta loja» no artigo da referência `LIV-001`. Em Encomendas, as
  encomendas que essa loja já tem no site.

## 6. Encomendas e tempo real

No site, faça uma encomenda de levantamento nessa loja.

- **Deve ver:** em segundos, um aviso no computador («Encomenda nova na loja online · LIV-…»). A encomenda aparece na
  Loja online sem carregar em nada.
- **Se demorar até 2 minutos:** o tempo real não ligou. Veja se o tópico chegou (passo 2) e se o computador chega a
  `wss://…supabase.co`.

## 7. A conta do site

Na Loja online, **Entrar** com uma conta de equipa do site (com MFA, se a tiver). Na encomenda de ensaio:
1. **Confirmar**;
2. **Pronta para levantar**: o cliente recebe o email «pronta para levantar»;
3. **Levantada pelo cliente**, com o pagamento em numerário.

- **Deve ver:**
  - no painel do site, a encomenda concluída;
  - o pagamento confirmado, se a conta tiver «Confirmar pagamentos», ou por confirmar na caixa, se não tiver;
  - tudo em nome da pessoa.

## 8. A conta do site sem Internet

Faça outra encomenda de ensaio. Desligue a rede e carregue em **A preparar**.

- **Deve ver:** «Sem Internet: a alteração fica na fila» e, na barra, «1 à espera de Internet».
- **Ao ligar a rede,** a alteração segue e a encomenda fica «a preparar» no painel.

## 9. O navegador

**Livraria → Internet:** abra o painel da livraria pelo favorito. Depois, tente abrir `192.168.1.1` e
`file:///C:/Windows`.

- **Deve ver:** o painel abre numa janela própria; os outros dois são recusados.

## 10. As vendas, ligado a um posto sem loja

1. No KanGest de ensaio: **Livraria → Ligação ao site → Desligar**. Apaga a chave, a cópia da Loja online e as sessões
   do site.
2. No painel: revogue «Ensaio — Huambo»; crie o posto **«Ensaio»**, **sem loja**, e emparelhe o KanGest de ensaio com
   ele.
3. Faça uma entrada de stock do artigo e emita uma FR.

- **Deve ver:**
  - em Livraria → Ligação ao site, «Documentos por enviar» volta a 0 em segundos;
  - no painel, no posto «Ensaio», os documentos recebidos e nenhum elo da cadeia AGT partido.

## 11. As vendas sem Internet

1. Desligue a rede do computador e emita mais duas FR.
   - **Deve ver:** a venda faz-se como sempre, a barra mostra «Sem ligação» (âmbar) e «Documentos por enviar: 2».
2. Volte a ligar a rede.
   - **Deve ver:** em 30 segundos, «Documentos por enviar: 0», e no painel todos os documentos, sem repetidos e sem elos partidos.

## 12. Arrumar

1. No painel, cancele as encomendas de ensaio.
2. Revogue o posto «Ensaio». Os documentos de ensaio ficam na base em nome dele e não contam para nenhuma loja.
3. No KanGest de ensaio: **Desligar**.

## 13. A loja a sério

1. Instale o KanGest Livraria no **computador servidor da loja**. Para trazer os dados do KanGest oficial, use a cópia
   exportada e restaure-a.
2. No painel, crie o posto da loja (com a loja) e emparelhe-o.
3. Tudo o que esse KanGest já emitiu segue para a base central. O painel mostra a contagem e se a cadeia AGT bate certo.
