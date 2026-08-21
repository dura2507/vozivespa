// Tour recommendations per bike model (Thomas, Telegram 2026-08-21).
// The Google Maps links are HIS links, pasted verbatim from the group -
// do not "improve" or re-resolve them. Labels and descriptions live in the
// dictionaries under fleet.tours so all 11 languages are covered.
//
// Model mapping is exactly what Thomas specified:
//   Liberty 50 (both)  -> Ugljan Island Loop + Nin Queen's Beach
//   Duke 125 + 390     -> Pag Loop incl. the Zrmanja river
//   Beta RR 125        -> Sveti Rok spot
// scooter-125 (Liberty 125) was NOT assigned a route by him and stays empty
// until he says which one it gets.

export type TourStop = {
  // Key into dict.fleet.tours.stops
  labelKey: string;
  url: string;
};

export type Tour = {
  // Key into dict.fleet.tours.routes
  id: "ugljan" | "nin" | "pag" | "svetirok";
  stops: TourStop[];
};

const UGLJAN: Tour = {
  id: "ugljan",
  stops: [
    { labelKey: "ferryZadar", url: "https://maps.app.goo.gl/9aJuFyfWvnCwdg5i9" },
    { labelKey: "preko", url: "https://maps.app.goo.gl/W1HdrHtrkdMGqM9v6" },
    { labelKey: "beachBar", url: "https://maps.app.goo.gl/e519SCemf1siFMPLA" },
    { labelKey: "gardenBar", url: "https://maps.app.goo.gl/xx9ih2ksVKqmyC9p9" },
    { labelKey: "castleFort", url: "https://maps.app.goo.gl/owMYaYwDwyT7Dq1r5" },
    { labelKey: "beach", url: "https://maps.app.goo.gl/nAFfFcvRfwT74xY56" },
    { labelKey: "ferryTkon", url: "https://maps.app.goo.gl/V8FK7xYg2MdbsJQ56" },
    { labelKey: "ferryBiograd", url: "https://maps.app.goo.gl/6vTHTWpfAsHU4D8LA" },
  ],
};

const NIN: Tour = {
  id: "nin",
  stops: [
    // Thomas named the spot without a link; a Maps search link is the safe
    // stand-in until he supplies his own.
    { labelKey: "queensBeach", url: "https://www.google.com/maps/search/?api=1&query=Queen%27s%20Beach%20Nin" },
  ],
};

const PAG: Tour = {
  id: "pag",
  stops: [
    { labelKey: "pagLoop", url: "https://maps.app.goo.gl/wdvepHLGENtUEAAg9" },
    { labelKey: "ferryPortMainland", url: "https://maps.app.goo.gl/My93fgNkQJKG1rZM7" },
    { labelKey: "ferryPortPag", url: "https://maps.app.goo.gl/tG4rSAuJBt38GfTZ7" },
    { labelKey: "karlobag", url: "https://maps.app.goo.gl/nEno8zph7i9U9YYG7" },
    { labelKey: "maslenica", url: "https://maps.app.goo.gl/vufdDBiWMU7Zpa9q9" },
  ],
};

const SVETI_ROK: Tour = {
  id: "svetirok",
  stops: [{ labelKey: "svetiRok", url: "https://maps.app.goo.gl/rexj6ryLy4wGFztY8" }],
};

export const TOURS: Record<string, Tour[]> = {
  "scooter-50": [UGLJAN, NIN],
  "scooter-50-topcase": [UGLJAN, NIN],
  "bike-125-b": [PAG],
  "bike-390": [PAG],
  "bike-125-a": [SVETI_ROK],
};
