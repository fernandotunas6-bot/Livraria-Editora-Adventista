// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Os dados da compra (quem, contacto e para onde), lembrados neste aparelho.
//
// Quase todas as compras são sem conta, e quem voltava tinha de escrever outra vez o nome, o
// telefone e a morada inteira — província, município, bairro, rua, referência — num ecrã
// pequeno. Como nas lojas grandes, a morada da última compra volta preenchida e o cliente só
// confirma. Fica também o que se ia escrevendo: fechar o carrinho sem querer, ou passar para
// outra página (cada página monta o seu carrinho), já não apaga o formulário.
//
// Só neste aparelho (localStorage), por conta (ou "convidado"), durante 180 dias. O cliente
// desliga com "Lembrar estes dados neste aparelho", e então apaga-se o que havia e deixa de
// se guardar. Nunca o pagamento, a assinatura, as notas ou o código do colportor.

const PREFIX = 'livraria:checkout:';
const OFF_KEY = 'livraria:checkout-nao-lembrar';
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_LEN = 300;

const FORM_FIELDS = ['name', 'email', 'phone', 'shippingMethod', 'pickupStore'];
const ADDRESS_FIELDS = [
  'provinceId', 'provinceName', 'municipalityId', 'municipalityName', 'localityId', 'localityName',
  'localityCustom', 'street', 'reference', 'phone', 'relativeName', 'relativePhone',
];

/** Chave por conta; sem conta, a do aparelho ("convidado"). */
export function checkoutMemoryKey(userId) {
  return `${PREFIX}${userId ? String(userId) : 'convidado'}`;
}

const pick = (obj, fields) => Object.fromEntries(
  fields.map((f) => [f, typeof obj?.[f] === 'string' ? obj[f].slice(0, MAX_LEN) : '']),
);

/** Há alguma coisa que valha a pena lembrar (não só os valores por omissão)? */
export function hasMemorableData({ form, address } = {}) {
  return [form?.name, form?.email, form?.phone, address?.street, address?.reference, address?.phone]
    .some((v) => String(v || '').trim());
}

/** O cliente pediu para não lembrar? */
export function checkoutMemoryOff() {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/** Os dados lembrados, ou `null` (nenhuns, velhos, desligado ou armazenamento bloqueado). */
export function readCheckoutMemory(key, now = Date.now()) {
  if (!key || checkoutMemoryOff()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || now - (Number(data.at) || 0) > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    const memory = { form: pick(data.form, FORM_FIELDS), address: pick(data.address, ADDRESS_FIELDS), at: Number(data.at) };
    return hasMemorableData(memory) ? memory : null;
  } catch {
    return null;
  }
}

/** Guarda (ou apaga, se não houver nada). Nunca lança. */
export function saveCheckoutMemory(key, { form, address } = {}, now = Date.now()) {
  if (!key || checkoutMemoryOff()) return;
  try {
    if (!hasMemorableData({ form, address })) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ form: pick(form, FORM_FIELDS), address: pick(address, ADDRESS_FIELDS), at: now }));
  } catch {
    // armazenamento cheio ou bloqueado: perde-se só a conveniência
  }
}

/**
 * Liga ou desliga a memória. Desligar apaga já tudo o que estava guardado neste aparelho
 * (de todas as contas que aqui compraram), não só daqui para a frente.
 */
export function setCheckoutMemoryEnabled(on) {
  try {
    if (on) {
      localStorage.removeItem(OFF_KEY);
      return;
    }
    localStorage.setItem(OFF_KEY, '1');
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // idem
  }
}
