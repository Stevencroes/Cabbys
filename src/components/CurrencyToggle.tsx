import { useBooking } from "../booking/BookingContext";
import { Currency } from "../lib/currency";

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "AWG", label: "ƒ AWG" },
  { code: "USD", label: "$ USD" },
  { code: "EUR", label: "€ EUR" },
];

export default function CurrencyToggle() {
  const { state, setField } = useBooking();

  return (
    <div className="cur-toggle">
      {CURRENCIES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={state.currency === code ? "on" : ""}
          onClick={() => setField("currency", code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
