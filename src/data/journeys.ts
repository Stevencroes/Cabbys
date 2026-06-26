import type { IconName } from "../components/Icon";

export type Journey = {
  key: string;
  title: string;
  desc: string;
  icon: IconName;
};

export const JOURNEYS: Journey[] = [
  { key: "airport", title: "Airport Transfer",  desc: "Arrivals & departures",    icon: "plane" },
  { key: "hotel",   title: "Hotel Transfer",    desc: "Between accommodations",   icon: "bed"   },
  { key: "beach",   title: "Beach Trip",        desc: "Eagle, Palm & more",       icon: "sun"   },
  { key: "dining",  title: "Dining & Nightlife",desc: "Restaurants & clubs",      icon: "plate" },
  { key: "custom",  title: "Custom Journey",    desc: "Any destination on island",icon: "pin"   },
];
