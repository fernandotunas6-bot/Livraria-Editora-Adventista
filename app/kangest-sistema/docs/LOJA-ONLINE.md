# Loja online no KanGest

**Livraria → Loja online.** A fase 6 do estudo, primeira parte ([docs/ECOSSISTEMA.md](../../../docs/ECOSSISTEMA.md), na
raiz da livraria).

O ecrã mostra as encomendas desta loja e o catálogo do site, da cópia local que chega com cada sincronização
([SINCRONIZACAO.md](SINCRONIZACAO.md)). **Funciona sem Internet**: mostra a última cópia e diz de quando é.

## O que mostra

- **Encomendas da loja**, com contadores que filtram: pendentes, levantamentos por fazer, em curso, concluídas e
  canceladas. Pesquisa-se pelo número, pelo cliente ou pelo telefone.
  - Cada encomenda abre com os artigos, o pagamento, o levantamento ou a morada da entrega, o cliente, as notas e os
    totais.
- **Produtos do site**, também os ocultos. Ao lado do stock que o site mostra fica **o stock desta loja**, do mesmo
  artigo pela referência do KanGest.
  - Os filtros: à venda, ocultos, sem stock no site, sem referência, e os que **não existem cá** (a referência do
    site não bate com nenhum artigo deste KanGest).

## Alterar: no painel do site

**Esta página só lê.** Para confirmar, preparar ou entregar uma encomenda, ou publicar e mudar um produto, use **Abrir
no painel do site**. Abre o painel no navegador do KanGest ([NAVEGADOR.md](NAVEGADOR.md)), com o login e o MFA de cada
pessoa. Assim:
- o KanGest não guarda sessões nem tokens de pessoas;
- as regras e as permissões do painel valem como sempre, sem as duplicar.

Ecrãs nativos para escrever ficam para depois, porque pedem antes uma decisão: como cada pessoa entra no KanGest com a
conta do site.

## Quem vê

Quem tem a API e Integrações (`sistema.api`), os relatórios (`relatorios.ver`) ou quem factura ao balcão
(`vendas.fatura_recibo`). As encomendas têm o nome e o telefone dos clientes. A cópia fica na base cifrada (SQLCipher)
e **apaga-se ao desligar** a ligação, ou ao ligar a outro posto.

## Como chega

Em cada volta da sincronização (de 30 em 30 segundos), o KanGest manda os seus cursores. O site responde com o que
mudou desde então (`public.kangest_novidades`, docs/KANGEST-SINCRONIZACAO.md §7 na raiz da livraria):
- até 200 encomendas e 200 produtos por pedido;
- mais pedidos seguidos na mesma volta, enquanto houver.

Cada encomenda ou produto alterado no site volta a vir e substitui o que havia (`loja_encomendas`, `loja_produtos`,
`sinc_cursores`; migração 0054).

## Testes

`services/tests.rs` (`loja_online_copia_local`):
- as novidades entram e uma alteração actualiza, sem duplicar;
- os contadores, os filtros e a pesquisa;
- um filtro desconhecido não chega ao SQL;
- o detalhe e o stock desta loja pela referência;
- os cursores;
- desligar apaga a cópia.

`sinc/loja.rs` testa os filtros fixos e a leitura do JSON.
