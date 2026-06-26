import { useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import { CATEGORIES, placesByCategory, searchPlaces, type Category, type Place } from "../../data/places";
import Icon from "../Icon";

export default function DestinationField({
  target,
  onPicked,
}: {
  target: "from" | "to";
  onPicked?: () => void;
}) {
  const { setField } = useBooking();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<Category | null>(null);

  const results: Place[] = query.trim()
    ? searchPlaces(query)
    : activeCat
    ? placesByCategory(activeCat)
    : [];

  function pick(name: string) {
    setField(target, name);
    setQuery("");
    onPicked?.();
  }

  return (
    <div className="dfield">
      <input
        className="txt"
        type="text"
        placeholder="Search a place or address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) pick(query.trim());
        }}
      />

      <div className="cat-row">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`cat-chip${activeCat === c.key ? " on" : ""}`}
            onClick={() => setActiveCat(activeCat === c.key ? null : c.key)}
          >
            <Icon name={c.icon} /> {c.label}
          </button>
        ))}
      </div>

      {results.length > 0 && (
        <div className="place-list">
          {results.map((p) => (
            <button key={p.id} type="button" className="opt" onClick={() => pick(p.name)}>
              <span className="opt-l">
                <span className="opt-name">{p.name}</span>
              </span>
              {p.meta && <span className="opt-meta">{p.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
