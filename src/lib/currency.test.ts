import { describe, it, expect } from "vitest";
import { convert, formatMoney, RATES, SYMBOL } from "./currency";

describe("currency", () => {
  it("keeps AWG at parity", () => {
    expect(convert(72, "AWG")).toBe(72);
    expect(formatMoney(72, "AWG")).toBe("ƒ72.00");
  });
  it("converts AWG to USD at the pegged rate", () => {
    expect(convert(179, "USD")).toBeCloseTo(100, 2);
    expect(SYMBOL.USD).toBe("$");
  });
  it("converts AWG to EUR", () => {
    expect(convert(197, "EUR")).toBeCloseTo(100, 2);
    expect(RATES.EUR).toBeCloseTo(1 / 1.97, 5);
  });
  it("formats with two decimals and symbol", () => {
    expect(formatMoney(40, "EUR")).toBe("€20.30");
  });
});
