// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

export const BRAND = {
  name: 'Livraria Adventista',
  shortName: 'LA',
  tagline: 'Literatura que edifica e transforma',
  // Sem email por omissão, pela mesma razão do telefone: o `.ao` nunca chegou a ser
  // registado, por isso este endereço aparecia aos clientes e tudo o que lhe escrevessem
  // voltava para trás. O verdadeiro vem de Configurações (contact_email).
  email: '',
  // Sem telefone por omissão: o verdadeiro vem de Configurações (contact_phone). Um número
  // provisório aqui aparecia aos clientes, e os botões de WhatsApp levavam-nos a ele.
  phone: '',
  address: 'Luanda, Angola',
};

export function pageTitle(suffix) {
  return suffix ? `${suffix} — ${BRAND.name}` : BRAND.name;
}
