// Child seats — the ages, and how they are written down.
//
// The price lives in quote.ts (CHILD_SEAT_USD), with every other number a
// guest pays. This file is the other half: which seat to bring.
//
// The ages used to be one optional free-text box ("e.g. 2 and 5") under the
// stepper. Optional meant a seat could be booked with no age at all, and a
// driver then had to guess between an infant carrier and a booster; free
// text meant "toddler" or "2 kids" got through. The owner now sells seats
// on "the right seat for your child", so the age is required, and asked as
// one choice per seat, which cannot be answered vaguely.

/** "under 1", then 1 to 12. Past 12 a child rides on the car's own belt. */
export const SEAT_AGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "0", label: "Under 1" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} year${i === 0 ? "" : "s"} old`,
  })),
];

/** One age, as it reads in a sentence: "under 1", "3". */
function ageWord(value: string): string {
  return value === "0" ? "under 1" : value;
}

/**
 * The ages as one readable string: "3", "2 and 5", "under 1 and 4".
 *
 * Kept as a single string because that is what the ride row has room for:
 * there is no seat_ages column, and the ages travel in `notes` as
 * "Child seats: 2 (ages 2 and 5)" — the shape the driver's ride view and
 * the admin email already show. Blank entries are dropped, so a half-filled
 * list never prints "2 and ".
 */
export function seatAgesLabel(ages: readonly string[]): string {
  const words = ages.filter((a) => a !== "").map(ageWord);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The line written into the ride's notes, or "" when there are no seats. */
export function seatNote(seats: number, ages: readonly string[]): string {
  if (seats <= 0) return "";
  const label = seatAgesLabel(ages.slice(0, seats));
  if (!label) return `Child seats: ${seats}`;
  return `Child seats: ${seats} (${seats === 1 ? "age" : "ages"} ${label})`;
}

/** Index of the first seat with no age chosen, or -1 when every seat has
    one. Zero seats asks for nothing. */
export function firstMissingSeatAge(seats: number, ages: readonly string[]): number {
  for (let i = 0; i < seats; i++) if (!ages[i]) return i;
  return -1;
}
