/** Categorias de gastos do cartão e regras simples de classificação automática. */

export const PURCHASE_CATEGORIES = [
  "Mercado",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Compras",
  "Vestuário",
  "Assinaturas",
  "Casa",
  "Lazer",
  "Pets",
  "Tarifas",
  "Outros",
] as const;

export const BILL_CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Educação",
  "Serviços",
  "Assinaturas",
  "Outros",
] as const;

const RULES: Array<[string, RegExp]> = [
  ["Tarifas", /\bIOF\b|ANUIDADE|TARIFA|ENCARGO|JUROS|MULTA/i],
  ["Assinaturas", /SPOTIFY|NETFLIX|CANVA|GOOGLE|APPLE\.COM|ANTHROPIC|OPENAI|AMAZON PRIME|DISNEY|HBO|YOUTUBE|DEEZER|GLOBOPLAY|MELIMAIS/i],
  ["Transporte", /UBER|99 ?RIDE|99APP|POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUST|ESTACION|SEM PARAR|VELOE|METRO|BILHETE/i],
  ["Alimentação", /IFD\*|IFOOD|99FOOD|RAPPI|RESTAUR|MADERO|PADARIA|PANIFICA|BURGER|PIZZ|LANCH|CAFE|FOOD|SALA GOURMET|OUTBACK|MC ?DONALD|BOB'?S|SUBWAY|DELICY/i],
  ["Mercado", /MERCAD(?!O ?LIVRE|OLIVRE|O\*)|SUPERMERC|PREZUNIC|GUANABARA|CARREFOUR(?!COM)|ASSAI|ATACAD|HORTI|FRUIT|MERCADEX|DIKA|PAO DE ACUCAR|EXTRA/i],
  ["Saúde", /DROGA|FARMA|RAIA|PACHECO|VENANCIO|CLINIC|HOSPITAL|LABORAT|ODONTO/i],
  ["Pets", /PET\b|PETZ|COBASI|BELISCANDOPET|VETERIN/i],
  ["Vestuário", /RENNER|RIACHUELO|C&A|ZARA|HERING|NETSHOES|CENTAURO|SAINTGERMAIN/i],
  ["Casa", /BARRA GAS|LEROY|TELHANORTE|CASAS ?BAHIA|MAGAZINE|TOK ?STOK|GAS COMERCIO/i],
  ["Lazer", /INGRESSO|CINEMA|CINEMARK|AIRBNB|BOOKING|HOTEL|STEAM|PLAYSTATION|XBOX|GAMER|LEITURA/i],
  ["Compras", /MERCADO ?LIVRE|MERCADOLIVRE|MERCADO\*|SHOPEE|AMAZON|ALIEXPRESS|SHEIN|MAGALU|BOTICARIO|NATURA|MP \*|PAYPAL|ECOM|BRASILBIBLIAS/i],
];

export function guessCategory(description: string): string {
  for (const [category, pattern] of RULES) {
    if (pattern.test(description)) return category;
  }
  return "Outros";
}
