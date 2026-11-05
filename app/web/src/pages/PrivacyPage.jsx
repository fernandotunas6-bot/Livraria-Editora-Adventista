import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { StoreContacts, useStoreIdentity } from '@/components/LegalPage';

/** Data desta versão. Mudar o texto é mudar também esta data. */
export const PRIVACY_UPDATED = '5 de Novembro de 2026';

const A = ({ to, children }) => <Link to={to} className="text-primary underline">{children}</Link>;

/**
 * Política de Privacidade e de cookies.
 *
 * Lista o que o sistema guarda de facto (ver as tabelas em supabase/migrations) e quem trata
 * esses dados por nós. Quando se acrescentar uma tabela com dados pessoais, um fornecedor ou
 * um tipo de armazenamento no browser, esta página tem de mudar no mesmo commit.
 */
export default function PrivacyPage() {
  const store = useStoreIdentity();
  const sections = [
    {
      id: 'responsavel',
      title: 'Quem trata os seus dados',
      body: (
        <p>
          A responsável pelo tratamento dos dados recolhidos neste site é a <strong className="text-foreground">{store.name}</strong>.
          Os contactos estão no fim desta página. Tratamos os dados de acordo com a Lei da Protecção de Dados
          Pessoais de Angola (Lei n.º 22/11).
        </p>
      ),
    },
    {
      id: 'dados',
      title: 'Que dados recolhemos',
      body: (
        <>
          <p><strong className="text-foreground">Conta:</strong> nome, email, telefone e fotografia (se a puser). Com a
            Google, recebemos o nome, o email e a fotografia da sua conta Google. A palavra-passe é guardada cifrada
            pelo sistema de autenticação; ninguém da equipa a consegue ver.</p>
          <p><strong className="text-foreground">Encomendas:</strong> nome, email, telefone, morada (província,
            município, localidade, rua e referência), notas, livros, valores, método de pagamento e a referência
            de pagamento que indicar. Se escolher partilhar a localização no checkout, guardamos as coordenadas para
            encontrar a morada.</p>
          <p><strong className="text-foreground">Entrega:</strong> a assinatura dada no checkout e na recepção, o nome
            e, quando aplicável, o número de documento de quem recebe, e a hora da entrega. Servem de prova de
            entrega.</p>
          <p><strong className="text-foreground">Atendimento:</strong> as mensagens do formulário de contacto e das
            conversas com a equipa de apoio. As conversas privadas da área de apoio são cifradas de ponta a ponta.</p>
          <p><strong className="text-foreground">Assistente virtual:</strong> as perguntas que escreve ao assistente
            do site.</p>
          <p><strong className="text-foreground">Actividade na loja:</strong> lista de desejos, avaliações que
            publicar e, com sessão iniciada, os livros que abriu (para as sugestões). Pode apagar este histórico.</p>
          <p><strong className="text-foreground">Comunicações:</strong> o email da newsletter, as preferências de
            contacto e o registo dos emails e mensagens enviados (para provar que o aviso de uma encomenda saiu).</p>
          <p><strong className="text-foreground">Segurança:</strong> o endereço IP (para limitar abusos), o
            navegador e o sistema de onde entra na conta (para o aviso de novo acesso, guardados em forma
            irreversível) e, se as activar, as subscrições de notificações no navegador.</p>
          <p>Não pedimos nem guardamos dados de cartão bancário.</p>
        </>
      ),
    },
    {
      id: 'finalidades',
      title: 'Para que os usamos',
      body: (
        <ul>
          <li><strong className="text-foreground">Cumprir a sua encomenda</strong>: preparar, cobrar, entregar, avisar de cada passo e tratar devoluções.</li>
          <li><strong className="text-foreground">Cumprir a lei</strong>: guardar os documentos de venda pelo prazo legal.</li>
          <li><strong className="text-foreground">Proteger a loja e a sua conta</strong>: prevenir fraude e abusos, e avisá-lo de acessos novos ou de mudanças na conta.</li>
          <li><strong className="text-foreground">Melhorar a loja</strong>: sugerir livros com base no que viu e comprou.</li>
          <li><strong className="text-foreground">Enviar novidades e campanhas</strong>: só com o seu consentimento, que pode retirar a qualquer momento.</li>
        </ul>
      ),
    },
    {
      id: 'partilha',
      title: 'Com quem partilhamos',
      body: (
        <>
          <p>Não vendemos nem alugamos os seus dados. Partilhamo-los apenas com quem nos presta serviços, e só o necessário:</p>
          <ul>
            <li><strong className="text-foreground">Supabase</strong>: base de dados, autenticação e ficheiros (servidores na União Europeia).</li>
            <li><strong className="text-foreground">Cloudflare</strong>: alojamento e protecção do site.</li>
            <li><strong className="text-foreground">Google</strong>: entrada com a conta Google, mapas das lojas e, quando é o fornecedor activo, o assistente virtual (Gemini).</li>
            <li><strong className="text-foreground">DeepSeek</strong>: assistente virtual, quando é o fornecedor activo.</li>
            <li><strong className="text-foreground">Fornecedor de email</strong> e <strong className="text-foreground">WhatsApp (Meta)</strong>: envio dos avisos de encomenda e de conta, quando activos.</li>
            <li><strong className="text-foreground">Estafetas e transportadoras</strong>: nome, telefone e morada, para fazer a entrega.</li>
          </ul>
          <p>
            Não escreva dados sensíveis (saúde, documentos, palavras-passe) no assistente virtual: as perguntas são
            enviadas ao fornecedor de inteligência artificial para obter a resposta.
          </p>
          <p>Podemos ainda comunicar dados às autoridades quando a lei o exigir.</p>
        </>
      ),
    },
    {
      id: 'transferencias',
      title: 'Dados fora de Angola',
      body: (
        <p>
          Alguns destes serviços guardam ou tratam dados fora de Angola (na União Europeia, nos Estados Unidos ou,
          no caso do DeepSeek, na China). Escolhemos fornecedores com medidas de segurança reconhecidas e
          limitamos o que lhes enviamos ao necessário para o serviço.
        </p>
      ),
    },
    {
      id: 'conservacao',
      title: 'Quanto tempo guardamos',
      body: (
        <ul>
          <li><strong className="text-foreground">Conta, lista de desejos, histórico de livros vistos e aparelhos</strong>: enquanto a conta existir.</li>
          <li><strong className="text-foreground">Encomendas e provas de entrega</strong>: pelo prazo que a lei comercial e fiscal exige para os documentos de venda, mesmo depois de apagar a conta.</li>
          <li><strong className="text-foreground">Newsletter</strong>: até cancelar a subscrição.</li>
          <li><strong className="text-foreground">Mensagens de atendimento</strong>: enquanto forem precisas para resolver o assunto e para eventuais reclamações.</li>
          <li><strong className="text-foreground">Registos de segurança</strong> (limites por IP): poucos minutos.</li>
        </ul>
      ),
    },
    {
      id: 'direitos',
      title: 'Os seus direitos',
      body: (
        <>
          <p>Pode, a qualquer momento:</p>
          <ul>
            <li>saber que dados temos sobre si e pedir uma cópia;</li>
            <li>corrigir dados errados (a maior parte faz-se em <A to="/profile?tab=settings">Perfil → Definições</A>);</li>
            <li>pedir que apaguemos a conta e os dados que não tenhamos de guardar por lei;</li>
            <li>opor-se ao uso dos dados para sugestões, e retirar o consentimento das novidades;</li>
            <li>apresentar reclamação à Agência de Protecção de Dados (APD).</li>
          </ul>
          <p>Para exercer estes direitos, escreva-nos a partir do email da conta. Respondemos no prazo que a lei estabelece.</p>
        </>
      ),
    },
    {
      id: 'seguranca',
      title: 'Como protegemos os dados',
      body: (
        <ul>
          <li>Ligações sempre cifradas (HTTPS).</li>
          <li>Cada pessoa da equipa só vê o que a sua função exige. As contas da equipa podem ter verificação em dois passos e, quando activa, ela é exigida em todas as operações.</li>
          <li>As regras de acesso estão na própria base de dados: cada cliente só lê as suas encomendas e os seus dados.</li>
          <li>Credenciais de serviços (email, inteligência artificial) ficam fora do alcance do site.</li>
        </ul>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies e armazenamento no navegador',
      body: (
        <>
          <p>
            Não usamos cookies de publicidade nem de seguimento entre sites. Guardamos no seu navegador apenas o
            necessário para o site funcionar:
          </p>
          <ul>
            <li>a sessão iniciada;</li>
            <li>o carrinho de compras e a última encomenda feita;</li>
            <li>pequenas preferências, como avisos que já fechou.</li>
          </ul>
          <p>
            Os mapas das lojas e a entrada com a Google são servidos pela Google, que pode usar os seus próprios
            cookies quando os abre. Pode apagar estes dados nas definições do navegador; nesse caso terá de voltar a
            entrar e o carrinho fica vazio.
          </p>
        </>
      ),
    },
    {
      id: 'menores',
      title: 'Menores',
      body: (
        <p>
          A loja dirige-se a adultos. Se tiver menos de 18 anos, faça as compras com a autorização e o
          acompanhamento de um dos pais ou de um encarregado de educação.
        </p>
      ),
    },
    {
      id: 'alteracoes',
      title: 'Alterações a esta política',
      body: (
        <p>
          Quando mudarmos a forma como tratamos os dados, actualizamos esta página e a data no topo. Se a mudança
          for importante, avisamos por email quem tem conta.
        </p>
      ),
    },
    {
      id: 'contactos',
      title: 'Contactos',
      body: (
        <>
          <p>Para qualquer questão sobre os seus dados:</p>
          <StoreContacts />
          <p>Veja também os <A to="/termos">Termos e Condições</A>.</p>
        </>
      ),
    },
  ];

  return (
    <LegalPage
      title="Política de Privacidade"
      subtitle="Que dados guardamos, para quê e os seus direitos"
      description="Como a loja trata os dados pessoais: o que recolhe, para que fins, com quem partilha, durante quanto tempo, cookies e os direitos dos clientes."
      updated={PRIVACY_UPDATED}
      intro={(
        <p>
          Recolhemos só o que precisamos para vender e entregar livros, e para manter a sua conta segura. Esta
          página diz o que é, para quê, com quem partilhamos e como pode pedir para ver, corrigir ou apagar.
        </p>
      )}
      sections={sections}
    />
  );
}
