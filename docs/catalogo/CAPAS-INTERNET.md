# Capas da internet para os produtos sem fotografia (2026-11-14)

Os produtos que vieram do KiGest entraram com uma **capa tipográfica** (o título sobre o
gradiente da casa), porque não havia fotografia de nenhum ([KIGEST.md](KIGEST.md)). Desses, os
154 que são livros, bíblias, revistas e o hinário têm capa publicada algures; os outros
(certificados, blocos, lenços, emblemas) não.

Procurou-se a capa de cada um na internet, viu-se cada candidata ao lado do título do produto, e
só entrou a que é de facto aquele livro. **Entraram 110. Ficam 44**, listados no fim com o motivo.

| | Quantas |
|---|---:|
| Capa da Casa Publicadora Brasileira (`imagens.cpb.com.br`) | 95 |
| Capa da Estante Virtual (livros que a CPB já não vende) | 15 |
| Confirmadas pelo **ISBN** da loja | 41 |
| Confirmadas pela **referência do KiGest**, que é o código do produto na CPB | 23 |
| Confirmadas pelo título (e vistas uma a uma) | 46 |

O registo de cada capa — de onde veio, o código na fonte, o título na fonte, como se confirmou e
o tratamento — está em [capas-internet.json](capas-internet.json).

## Como se procurou

1. **Loja da CPB.** `scripts/catalogo/procurar_capas.py` pesquisa o título (e variantes sem
   «Vol.», «Encadernado», «(Livro Infantil)»…) em `cpb.com.br`, abre a página de cada resultado e
   lê o título completo, o ISBN e o endereço da capa.
   - Descobriu-se que **as referências do KiGest com 4 ou 5 algarismos são o código do produto
     na CPB**: «Bíblia da Mulher» tem a referência 16206, e o produto 16206 da CPB é a «Bíblia da
     Mulher (Capa Cinza)». O script usa-as como primeiro candidato.
   - A pesquisa da CPB não acha grafias diferentes: «Testemunho para Igreja Vol. 2» (é
     «Testemunhos para a Igreja, Vol. 2»), «Mente Carácter Personalidade» («Mente, Caráter e
     Personalidade»). Esses procuraram-se à mão e confirmaram-se pelo ISBN.
2. **Estante Virtual.** Para os livros que a CPB já não vende (livros missionários de anos
   anteriores, edições antigas), `scripts/catalogo/estante.py` pesquisa pelo ISBN e pelo título.
   As fotos são dos livreiros: só entraram as que mostram a capa inteira, de frente, sem mão,
   etiqueta ou autocolante.
3. OpenLibrary e Google Books não têm estes ISBN (o Google Books recusava por limite de pedidos);
   a loja da SBB só pesquisa no navegador.

## A auditoria visual

**Primeira passagem — é este o livro?** Folhas com a capa tipográfica actual à esquerda e as
candidatas ao lado, produto a produto (126 com candidata). Rejeitou-se o que não é o livro, e
houve de tudo:

- a pesquisa pelo ISBN devolveu livros sem relação: «250 Receitas», «A Saúde pelos Alimentos»,
  «Manual dos Anciãos», «Corpo Saudável», «Desfrutar da Vida», «Mente Positiva», «Manual Diáconos
  e Diaconisas», «Guia de Secretaria» (romances, livros de arquitectura, de culinária);
- a referência do KiGest de «Corte» (23568) não existe na CPB, e a de «Por que Saí do
  Escritório» (16086) é outro livro, «Por Que Mudei de Exército»;
- «Viagem ao Desconhecido» deu «Xarana — Viagem ao desconhecido», outro livro;
- «Vida de Jesus» e «Guia para Diáconos» só tinham fotos com uma etiqueta ou um autocolante
  colados na capa;
- «Meditação da Mulher» e «Meditação 2026»: há uma por ano e não se sabe qual é a da loja;
- «Sinta-se Bem» e «O Poder Medicinal dos Sucos»: o ISBN da loja é da edição portuguesa e só se
  encontrou a brasileira, que pode ter outra capa.

Entre várias edições do mesmo livro escolheu-se a do ISBN: «Felizes no Amor» (ISBN de 2018, capa
cinzenta, não a dos anos 90), «Como Formar Filhos Vencedores» (edição amarela). Entre fotos da
mesma capa, a digitalizada de frente.

**Segunda passagem — ficou bem?** As capas tratadas viram-se todas de novo em grelha. Isto
apanhou erros do tratamento: uma dúzia de capas impressas até à borda (as da Ellen G. White, bege
ou cinzentas) e algumas digitalizações da Estante Virtual tinham sido cortadas a mais, porque a cor da própria capa foi tomada pelo fundo; e duas fotos ficaram tortas ou só com um canto.
Corrigiu-se (ver «Tratamento») e voltou-se a ver tudo.

## Tratamento

`scripts/catalogo/capas_internet.py` lê o registo e grava cada capa a **400×600 WebP** por cima
da tipográfica, **com o mesmo nome de ficheiro**, em `app/web/public/images/capas/kigest/`:

- maqueta da CPB com fundo transparente, preto ou branco: endireita a frente pelas quatro arestas
  (`achatar.py`, a que ganhou o parâmetro `tam`);
- capa digitalizada de frente («plano»): apara a margem **só se ela for branca ou preta** e ajusta
  a 2:3 sem perspectiva — era aqui o erro da primeira volta;
- foto do livro com fundo real: cantos dados à mão (`quad` no registo) — foi o caso de «Guiados
  por Deus».

Como os nomes não mudaram, **a base de dados não muda** para 108 deles. A migração
`20261114160000_capas_da_internet.sql` trata dos dois que não tinham imagem nenhuma (estão
ocultos e continuam ocultos): «Mensageiro» e «Por que Não Mas Estpita». Escreve só onde a capa
está vazia, e corrige o nome do segundo para «Por Que Não Sou Mais Espírita».

Quem já tinha visitado a loja vê a capa tipográfica mais uma vez: o service worker serve as
imagens da cache e actualiza-as em segundo plano, por isso na visita seguinte já aparece a nova.

## Notas para a equipa

| Produto | Nota |
|---|---|
| «Por que Não Mas Estpita» (KiGest 000163, oculto) | Pelo ISBN 9788534509305 é **«Por Que Não Sou Mais Espírita»**, de Maurício Braga: a migração corrige o nome e o autor. Continua oculto porque não tem descrição; escrevendo-a, pode publicar-se. |
| «Testemunhos para a Igreja» (000217) | O ISBN é o do **Vol. 7**; o nome no site não diz o volume. |
| «Princípios sobre Aposentadoria» (000209) | O ISBN na base de dados tem uma gralha: `9788732534895`; o da CPB é `9788534534895`. |
| «O Último Convite» (000500) | A descrição chama-lhe folheto; é o livro missionário de Clifford Goldstein. |
| «Nepp-lar Adventista» e «Nepp-temperança» | São «O Lar Adventista» e «Temperança», de Ellen G. White (a referência do KiGest é o código CPB). |
| «O Grande Conflito Infantil» (00033) | Pôs-se «Deus e o Anjo Rebelde — O Grande Conflito recontado», a versão para crianças da CPB. Provável, não confirmado. |
| «Conselhos sobre Mordomia» | O ISBN da loja é de uma edição antiga; a capa é a da edição actual. |
| Bíblias Andrews, Arqueológica, Aventureiros e Desbravadores | Existem em várias cores; pôs-se uma (a dos Desbravadores pelo ISBN, rosa). **Confirmar a cor na loja.** |
| «Guia de Liberdade Religiosa», «Guiados por Deus», «Guia para Anciãos», «Por Que Não Sou Mais Espírita» | Só havia fotos pequenas (184–240 px de largura): ficam legíveis mas menos nítidas. |

## Os 44 que ficam com a capa tipográfica

Precisam de uma fotografia do exemplar da loja (de frente, sem plástico) ou de quem saiba qual é
a edição.

| Motivo | Produtos |
|---|---|
| Bíblias de edição local ou missionária, sem capa na internet | Missionária «Eu Vou», «Nova Semente» (2), «Recomeçar», «Se o Filho Libertar», «Semeando a Palavra que Transforma», com Concordância ARC, RA Rosa, «Sociedade Bíblica Brasil», Novo Testamento em Umbundo |
| Edição portuguesa ou espanhola (Publicadora Atlântico, Servir, Safeliz) sem capa encontrada | «Corpo Saudável», «Desfrutar da Vida», «Mente Positiva», «Sinta-se Bem», «O Poder Medicinal dos Sucos», «Manual dos Anciãos», «Manual Diáconos e Diaconisas», «250 Receitas», «A Saúde pelos Alimentos» |
| O resultado era outro livro, ou só havia fotos com etiqueta | «Guia de Secretaria da Igreja», «Guia do Diácono», «Vida de Jesus», «Viagem ao Desconhecido» (2), «Por que Saí do Escritório», «Corte» |
| Não se sabe que edição é (anual, série, nome vago) | «Meditação 2026», «Meditação da Mulher», «Quebrando o Silêncio», «Trimestrais», «Revista Viva», «Revista Esperança Novo Tempo», «Kit de Comentários», «Pesquisador», «101 Segredos», «111 Administrar Dinheiro», «111 Estudante», «111 Dicas para Criar Filhos», «Mensagens e Mensageiros», «Esperança para Família Infantil», «Guia do Ministério da Criança», «100 Anos de Missão, Fé e Esperança» |
| Ocultos, sem nome legível | «Bilingue», «Regras para que» |

Para pôr a fotografia: no painel, no produto, trocar a capa. Para refazer uma destas capas a
partir de outra fonte, acrescenta-se a entrada em `capas-internet.json` e corre-se:

```bash
python3 scripts/catalogo/capas_internet.py docs/catalogo/capas-internet.json pasta-das-fontes/ --so <id>
```

(com `opencv-python-headless`, `pillow` e `numpy`; as fontes descarregam-se do `url` de cada
entrada para a pasta, com o nome do campo `fonte`).
