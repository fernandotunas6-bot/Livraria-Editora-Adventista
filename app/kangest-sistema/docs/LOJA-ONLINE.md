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

## Alterar, com a conta do site de cada pessoa

Para alterar encomendas no próprio KanGest, cada pessoa carrega em **Entrar** e usa a **sua** conta do site: o email,
a senha e o código da aplicação de autenticação, se a conta tiver MFA. Depois, no detalhe de cada encomenda, aparecem
as alterações possíveis no estado em que ela está:

| Botão | No site | Caminho |
|---|---|---|
| Confirmar | estado «confirmada» | PostgREST, com a RLS |
| A preparar | entrega «a preparar» | `POST /delivery-event` |
| Pronta para levantar | entrega `shipped` numa encomenda de levantamento (o cliente vê «Pronta para levantar») | `POST /delivery-event` |
| Enviada | entrega `shipped` | `POST /delivery-event` |
| Entregue ou Levantada pelo cliente | entrega «entregue» | `POST /delivery-event` |
| Cancelar | cancelada (o stock volta) | `POST /delivery-event` |

Com dinheiro por receber, «Entregue» pergunta quanto se recebeu e como, ou porque se entrega sem receber. Fica como no
painel:
- com «Confirmar pagamentos», o pagamento fica confirmado;
- sem ela, fica por confirmar na caixa;
- sem pagamento, o motivo vai para o registo de segurança e avisa os administradores.

**Tudo vai em nome da pessoa**, com as permissões dela no site e os mesmos avisos ao cliente; o site não distingue do
painel. A senha não fica guardada.

**A sessão:**
- fica cifrada com a chave mestra (`sessoes_site`), só para aquele utilizador do KanGest;
- renova-se sozinha;
- acaba ao fim de **12 horas** (um turno), ao sair ou ao desligar a ligação.

**Sem Internet**, a alteração fica em `loja_comandos`, em nome de quem a fez, e segue na volta seguinte da
sincronização com ligação. A barra da Loja online mostra «N à espera de Internet», com a lista e «Repetir as que
falharam». Se a sessão da pessoa já tiver acabado quando a ligação voltar, a alteração fica com erro até ela entrar
outra vez.

Os produtos (publicar, preços, capas) continuam a mudar-se no painel do site: «Abrir no painel do site», no navegador do
KanGest.

Contas que só entram com o Google não têm senha: para entrar no KanGest, a pessoa define uma senha na conta do site.

## Quem vê

Quem tem a API e Integrações (`sistema.api`), os relatórios (`relatorios.ver`) ou quem factura ao balcão
(`vendas.fatura_recibo`). As encomendas têm o nome e o telefone dos clientes. A cópia fica na base cifrada (SQLCipher)
e **apaga-se ao desligar** a ligação, ou ao ligar a outro posto.

## Como chega

Em cada pedido da sincronização, o KanGest manda os seus cursores. Os documentos da fila saem logo (de 30 em 30
segundos); sem nada para enviar, as novidades pedem-se de 2 em 2 minutos, porque cada pedido conta na quota da Edge
Function. «Sincronizar agora», no ecrã da ligação, pede-as já. O site responde com o que
mudou desde então (`public.kangest_novidades`, docs/KANGEST-SINCRONIZACAO.md §7 na raiz da livraria):
- até 200 encomendas e 200 produtos por pedido;
- mais pedidos seguidos na mesma volta, enquanto houver.

Cada encomenda ou produto alterado no site volta a vir e substitui o que havia (`loja_encomendas`, `loja_produtos`,
`sinc_cursores`; migração 0054).

## Testes

`services/tests.rs` (`loja_online_conta_do_site`):
- sem sessão do site não se altera nada;
- a sessão fica cifrada;
- sem Internet, as alterações ficam na fila em nome de quem as fez, com o pagamento;
- só as alterações conhecidas e ids que podem ir num endereço;
- a volta sem Internet não as perde;
- o turno de 12 horas, sair, e desligar apaga tudo.

`sinc/pessoa.rs` testa as acções e os estados da entrega, os ids, o turno, o nível do token e as mensagens.

`services/tests.rs` (`loja_online_copia_local`):
- as novidades entram e uma alteração actualiza, sem duplicar;
- os contadores, os filtros e a pesquisa;
- um filtro desconhecido não chega ao SQL;
- o detalhe e o stock desta loja pela referência;
- os cursores;
- desligar apaga a cópia.

`sinc/loja.rs` testa os filtros fixos e a leitura do JSON.
