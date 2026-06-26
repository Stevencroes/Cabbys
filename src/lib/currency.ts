export type Currency = "AWG" | "USD" | "EUR";

export const RATES: Record<Currency, number> = { AWG: 1, USD: 1 / 1.79, EUR: 1 / 1.97 };
export const SYMBOL: Record<Currency, string> = { AWG: "ƒ", USD: "$", EUR: "€" };

export function convert(awg: number, to: Currency): number {
  return awg * RATES[to];
}

export function formatMoney(awg: number, to: Currency): string {
  return `${SYMBOL[to]}${convert(awg, to).toFixed(2)}`;
}
