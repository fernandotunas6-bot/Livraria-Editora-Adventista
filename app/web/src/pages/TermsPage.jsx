import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { StoreContacts, useStoreIdentity } from '@/components/LegalPage';

/** Data desta versão. Mudar o texto é mudar também esta data. */
export const TERMS_UPDATED = '5 de Novembro de 2026';

const A = ({ to, children }) => <Link to={to} className="text-primary underline">{children}</Link>;

/**
 * Termos e Condições de Utilização e Responsabilidades.
 *
 * O texto descreve o que a loja faz de facto: livros físicos, preços em kwanzas, pagamentos
 * confirmados à mão pela equipa, entrega com assinatura, levantamento nas lojas, devolução em
 * 30 dias. Quando o funcionamento mudar, o texto muda com ele.
 */
export default function TermsPage() {
  const store = useStoreIdentity();
  const sections = [
    {
      id: 'ambito',
      title: 'Quem somos e a que se aplicam estes termos',
      body: (
        <>
          <p>
            Este site é a loja online da <strong className="text-foreground">{store.name}</strong>. Estes termos
            aplicam-se a quem visita o site, cria uma conta ou faz uma encomenda. Ao encomendar, aceita a versão
            em vigor nesse momento.
          </p>
          <p>
            Se não concordar com algum ponto, não use o site para comprar e fale connosco: as lojas físicas
            continuam ao seu dispor.
          </p>
        </>
      ),
    },
    {
      id: 'conta',
      title: 'A sua conta',
      body: (
        <ul>
          <li>Pode criar conta com email e palavra-passe ou com a sua conta Google.</li>
          <li>Os dados que indicar devem ser verdadeiros e estar actualizados, sobretudo o telefone e a morada.</li>
          <li>A palavra-passe é pessoal. É responsável pelo que for feito com a sua conta até nos avisar de um uso indevido.</li>
          <li>
            Podemos suspender uma conta usada para fraude, abuso ou para prejudicar outros clientes. Avisamos por
            email, e pode responder-nos se achar que é um engano.
          </li>
          <li>Pode pedir o encerramento da conta a qualquer momento (ver a <A to="/privacidade">Política de Privacidade</A>).</li>
        </ul>
      ),
    },
    {
      id: 'produtos',
      title: 'Livros, preços e disponibilidade',
      body: (
        <ul>
          <li>Vendemos livros e outros artigos físicos. Não vendemos produtos digitais nem licenças.</li>
          <li>
            As imagens e descrições ajudam a escolher, mas a capa pode variar com a edição ou a reimpressão. O
            conteúdo do livro é o indicado.
          </li>
          <li>Os preços estão em kwanzas (Kz) e incluem os impostos aplicáveis. Os portes aparecem à parte antes de confirmar.</li>
          <li>
            O stock é o das nossas lojas e pode esgotar entre a sua escolha e a confirmação. Se isso acontecer,
            avisamos e devolvemos o que já tiver pago por esse artigo.
          </li>
          <li>
            Se um preço estiver manifestamente errado (por exemplo, por um erro de escrita), contactamo-lo antes de
            seguir com a encomenda. Pode aceitar o preço correcto ou cancelar sem custos.
          </li>
        </ul>
      ),
    },
    {
      id: 'encomendas',
      title: 'Encomendas',
      body: (
        <>
          <p>
            Depois de confirmar, recebe o número da encomenda e um email de recepção. A venda fica concluída quando
            confirmamos o pagamento, ou, nos pagamentos na entrega e no levantamento, quando a encomenda é entregue.
          </p>
          <p>Podemos recusar ou cancelar uma encomenda, devolvendo sempre o que tiver sido pago, quando:</p>
          <ul>
            <li>o artigo esgotou ou o preço estava errado e não aceitou o correcto;</li>
            <li>o pagamento não pôde ser confirmado;</li>
            <li>há sinais claros de fraude ou de dados falsos.</li>
          </ul>
          <p>Pode pedir para alterar ou cancelar uma encomenda enquanto não estiver expedida.</p>
        </>
      ),
    },
    {
      id: 'pagamentos',
      title: 'Pagamentos',
      body: (
        <ul>
          <li>Aceitamos os métodos activos no checkout, como transferência bancária, Multicaixa Express e pagamento na entrega ou no levantamento.</li>
          <li>
            Nas transferências e no Multicaixa Express, indique a referência ou o comprovativo. A nossa equipa
            confere o pagamento e confirma a encomenda; só então começa a preparação.
          </li>
          <li>O site não pede nem guarda dados de cartão bancário.</li>
          <li>Se um pagamento for feito a mais ou em duplicado, devolvemos a diferença.</li>
        </ul>
      ),
    },
    {
      id: 'entrega',
      title: 'Entrega e levantamento',
      body: (
        <ul>
          <li>Os custos e prazos estão em <A to="/shipping-returns">Envios e Devoluções</A> e são sempre mostrados no checkout antes de confirmar.</li>
          <li>Os prazos são estimativas e contam a partir da confirmação do pagamento. Avisamos se houver atraso.</li>
          <li>A entrega ao domicílio exige conta, para podermos confirmar a morada e a entrega consigo.</li>
          <li>
            Na entrega registamos o nome de quem recebe, a assinatura e a hora, como prova de entrega. Verifique a
            embalagem e diga-nos logo se tiver danos visíveis.
          </li>
          <li>A responsabilidade pelos livros passa para si no momento da entrega ou do levantamento.</li>
          <li>
            Para levantar na loja, traga o número da encomenda e um documento de identificação. Se a encomenda não
            for levantada no prazo que lhe indicarmos, contactamo-lo antes de a cancelar e reembolsar.
          </li>
        </ul>
      ),
    },
    {
      id: 'devolucoes',
      title: 'Devoluções, trocas e reembolsos',
      body: (
        <>
          <ul>
            <li>Tem 30 dias a contar da entrega para devolver um livro em bom estado e na embalagem original.</li>
            <li>Livros danificados, incompletos ou diferentes do encomendado são trocados ou reembolsados, com o reenvio por nossa conta.</li>
            <li>O reembolso é feito depois de recebermos e conferirmos o livro, pelo mesmo meio de pagamento sempre que possível. Avisamos por email.</li>
          </ul>
          <p>
            Estas condições somam-se aos direitos que a lei lhe dá como consumidor, e não os substituem. Ver as
            condições completas em <A to="/shipping-returns">Envios e Devoluções</A>.
          </p>
        </>
      ),
    },
    {
      id: 'avaliacoes',
      title: 'Avaliações e outros conteúdos seus',
      body: (
        <>
          <p>Quando escreve uma avaliação ou uma mensagem, compromete-se a que ela:</p>
          <ul>
            <li>seja sobre o livro ou o serviço, e fiel à sua experiência;</li>
            <li>não tenha linguagem ofensiva, discriminatória ou ilegal, nem publicidade;</li>
            <li>não inclua dados pessoais de outras pessoas.</li>
          </ul>
          <p>
            Podemos retirar conteúdos que não cumpram estas regras. As avaliações são públicas: aparecem no site
            com o nome e a fotografia do seu perfil. Pode apagar as suas a qualquer momento.
          </p>
        </>
      ),
    },
    {
      id: 'uso',
      title: 'Utilização aceitável do site',
      body: (
        <>
          <p>Não é permitido:</p>
          <ul>
            <li>tentar entrar na conta de outra pessoa ou em áreas reservadas à equipa;</li>
            <li>fazer pedidos automáticos em massa que sobrecarreguem o site, ou contornar os limites de pedidos;</li>
            <li>usar o site para fraude, para enviar conteúdos maliciosos ou para recolher dados de outros clientes.</li>
          </ul>
          <p>Podemos bloquear o acesso a quem o faça.</p>
        </>
      ),
    },
    {
      id: 'responsabilidades-loja',
      title: 'As nossas responsabilidades',
      body: (
        <>
          <p>Comprometemo-nos a:</p>
          <ul>
            <li>entregar os livros encomendados, em bom estado, na morada ou na loja indicadas;</li>
            <li>manter correctas as informações de preço, stock e prazos, e corrigi-las quando falharem;</li>
            <li>avisá-lo por email de cada passo importante da encomenda e da conta;</li>
            <li>tratar os seus dados com cuidado, como descrito na <A to="/privacidade">Política de Privacidade</A>;</li>
            <li>responder às reclamações e resolver os problemas causados por nós.</li>
          </ul>
          <p>Não respondemos por atrasos ou falhas que não dependam de nós, como:</p>
          <ul>
            <li>morada, telefone ou email errados indicados no checkout;</li>
            <li>falhas de bancos, do Multicaixa, de operadoras de telecomunicações ou de transportadoras;</li>
            <li>situações de força maior (catástrofes, greves gerais, cortes de estradas ou decisões das autoridades).</li>
          </ul>
          <p>
            O assistente virtual do site dá respostas indicativas. Para decisões sobre uma encomenda, um pagamento
            ou uma devolução, vale sempre o que a nossa equipa confirmar.
          </p>
          <p>Nada nestes termos limita a nossa responsabilidade nos casos em que a lei não o permite.</p>
        </>
      ),
    },
    {
      id: 'responsabilidades-cliente',
      title: 'As suas responsabilidades',
      body: (
        <ul>
          <li>Indicar dados verdadeiros, sobretudo a morada, o telefone e o email da encomenda.</li>
          <li>Estar contactável no telefone indicado para combinarmos a entrega.</li>
          <li>Pagar a encomenda pelo método escolhido e indicar correctamente a referência do pagamento.</li>
          <li>Verificar a encomenda ao receber e avisar-nos de problemas dentro do prazo de devolução.</li>
          <li>Guardar a palavra-passe e avisar-nos se suspeitar de uso indevido da conta.</li>
        </ul>
      ),
    },
    {
      id: 'propriedade',
      title: 'Propriedade intelectual',
      body: (
        <p>
          Os textos, o logótipo e o desenho do site pertencem à {store.name} ou são usados com autorização. As capas
          e os textos dos livros pertencem às respectivas editoras e autores. Não os reproduza sem autorização.
        </p>
      ),
    },
    {
      id: 'comunicacoes',
      title: 'Comunicações',
      body: (
        <p>
          Enviamos sempre os emails necessários à encomenda e à segurança da conta. As novidades e campanhas só
          seguem se as aceitar, e cada uma tem um link para deixar de as receber.
        </p>
      ),
    },
    {
      id: 'reclamacoes',
      title: 'Reclamações e resolução de litígios',
      body: (
        <>
          <p>
            Se algo correr mal, fale connosco primeiro, com o número da encomenda: é a forma mais rápida de
            resolver. Respondemos em dias úteis.
          </p>
          <p>
            Se não ficar satisfeito com a nossa resposta, pode apresentar reclamação ao Instituto Nacional de
            Defesa do Consumidor (INADEC).
          </p>
          <p>
            Estes termos regem-se pela lei angolana. Os litígios são resolvidos no foro da comarca de Luanda, sem
            prejuízo das regras de protecção do consumidor que lhe sejam mais favoráveis.
          </p>
        </>
      ),
    },
    {
      id: 'alteracoes',
      title: 'Alterações a estes termos',
      body: (
        <p>
          Podemos actualizar estes termos para reflectir mudanças na loja ou na lei. A data no topo indica a versão.
          Cada encomenda rege-se pela versão em vigor no dia em que foi feita.
        </p>
      ),
    },
    {
      id: 'contactos',
      title: 'Contactos',
      body: <StoreContacts />,
    },
  ];

  return (
    <LegalPage
      title="Termos e Condições"
      subtitle="Utilização do site, compras e responsabilidades"
      description="Termos e condições da loja online: conta, encomendas, pagamentos, entregas, devoluções e as responsabilidades da loja e do cliente."
      updated={TERMS_UPDATED}
      intro={(
        <p>
          Escrevemos estes termos para serem lidos. Resumem como funcionam as compras no site, o que pode esperar de
          nós e o que precisamos de si. Se algo não estiver claro, veja as <A to="/faq">Perguntas Frequentes</A> ou
          fale connosco.
        </p>
      )}
      sections={sections}
    />
  );
}
