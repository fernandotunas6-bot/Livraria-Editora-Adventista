// Dinheiro escrito sempre da mesma maneira: "Kz 14 500,00", o formato da loja (formatCurrency em
// api/EcommerceApi.js, que recebe cêntimos). Este recebe kwanzas.
//
// O painel e a conta do cliente tinham quatro formas para o mesmo número: "Kz 7500.00"
// (toFixed, sem separador de milhares e com ponto), "Kz 14 316,667" (sem máximo de casas
// decimais), "68 900 Kz" e "Kz 68 900,00".

export function kwanza(value) {
  const n = Number(value);
  const amount = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  return `Kz ${amount.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
