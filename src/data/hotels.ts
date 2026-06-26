export type Place = {
  id: string;
  name: string;
  meta: string;
  zone: string;
};

export const AIRPORT: Place = {
  id: "airport",
  name: "Queen Beatrix International Airport",
  meta: "AUA · Oranjestad",
  zone: "airport",
};

export const HOTELS: Place[] = [
  { id: "renaissance",  name: "Renaissance Aruba",         meta: "Oranjestad",        zone: "A" },
  { id: "manchebo",     name: "Manchebo Beach Resort",     meta: "Eagle Beach",       zone: "B" },
  { id: "hilton",       name: "Hilton Aruba",              meta: "Palm Beach",        zone: "C" },
  { id: "hyatt",        name: "Hyatt Regency Aruba",       meta: "Palm Beach",        zone: "C" },
  { id: "marriott",     name: "Aruba Marriott Resort",     meta: "Palm Beach",        zone: "C" },
  { id: "ritz",         name: "The Ritz-Carlton Aruba",    meta: "Palm Beach",        zone: "C" },
];

export const CUSTOM_LOC: Place = {
  id: "custom",
  name: "Custom location",
  meta: "Enter address",
  zone: "",
};
