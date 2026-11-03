export const BRAND = {
  name: 'Livraria Adventista',
  shortName: 'LA',
  tagline: 'Literatura que edifica e transforma',
  email: 'contacto@livrariaadventista.ao',
  // Sem telefone por omissão: o verdadeiro vem de Configurações (contact_phone). Um número
  // provisório aqui aparecia aos clientes, e os botões de WhatsApp levavam-nos a ele.
  phone: '',
  address: 'Luanda, Angola',
};

export function pageTitle(suffix) {
  return suffix ? `${suffix} — ${BRAND.name}` : BRAND.name;
}
