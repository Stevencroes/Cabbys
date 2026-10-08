// Dollars, as the admin board writes them: "$1,933", not "$1933".
//
// The site's usd() in src/lib/quote.ts prints a bare rounded number, which
// is right on a booking card where a fare never reaches four digits and
// wrong on a desk where a week's takings always do — "$25410" on a tile is
// a number the eye has to count the digits of. Kept here rather than
// changed at the source because usd() also writes the fares guests see
// and the strings the booking emails and tests are pinned to, none of
// which this board should be able to move. Same rounding as usd(): whole
// dollars, so the two can never disagree about an amount, only about the
// comma.
export const usd = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");
