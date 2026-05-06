export type PricingTiers = {
  day: string;
  weekend: string;
  week: string;
  month: string;
};

export type Category = {
  id: string;
  name: string;
  model: string;
  tag: string;
  tagColor: string;
  price: string;
  priceUnit: string;
  priceFrom?: boolean;
  description: string;
  longDescription: string;
  tagline: string;
  image: string;
  gallery: string[];
  licence: string;
  licenceCode: string;
  maxSpeed: string;
  extraHour: string;
  displacement: string;
  power: string;
  seats: number;
  tank: string;
  consumption: string;
  range: string;
  year: string;
  pricing: PricingTiers;
  season: string;
  experienceNote?: string;
  variantNote?: string;
  placeholder?: boolean;
  featured?: boolean;
};

export type Review = {
  id: string;
  name: string;
  date: string;
  rating: number;
  text: string;
};

export type BlockedRange = {
  from: Date;
  to: Date;
};

const PLACEHOLDER_PRICING: PricingTiers = {
  day: "—",
  weekend: "—",
  week: "—",
  month: "—",
};

export const CATEGORIES: Category[] = [
  {
    id: "scooter-50",
    name: "Scooter 50",
    model: "Piaggio Liberty 50 iGet",
    tag: "BEGINNER",
    tagColor: "bg-red",
    price: "35€",
    priceUnit: "/day",
    priceFrom: true,
    description:
      "Sparsam, leicht zu fahren, ideal für die Stadt und Touristen.",
    longDescription:
      "Sehr sparsam, leicht zu handhaben und perfekt für entspanntes Cruisen durch Zadar und an der Küste.",
    tagline: "Sehr sparsam, ideal für Touristen / Stadt.",
    image: "/bikes/scooter-50.jpg",
    gallery: ["/bikes/scooter-50.jpg", "/bikes/scooter-50-b.jpg"],
    licence: "B or AM category",
    licenceCode: "AM",
    maxSpeed: "45 km/h",
    extraHour: "6€/h",
    displacement: "50cc",
    power: "~3 PS",
    seats: 2,
    tank: "6,0 L",
    consumption: "~2,5 L / 100 km",
    range: "200–240 km",
    year: "2024",
    pricing: { day: "35€", weekend: "—", week: "—", month: "—" },
    season: "April – October",
    experienceNote: "Driver should be experienced.",
    variantNote:
      "Two variants: without topcase from 35€/day, with topcase 39€/day. Topcase variant photo and tier prices coming soon.",
  },
  {
    id: "scooter-50-topcase",
    name: "Scooter 50",
    model: "Piaggio Liberty 50 iGet — Topcase",
    tag: "BEGINNER",
    tagColor: "bg-red",
    price: "39€",
    priceUnit: "/day",
    description:
      "Same Piaggio Liberty 50 with a topcase for extra storage. Photo and full pricing coming soon.",
    longDescription:
      "Gleiches Modell wie der Standard-50er, zusätzlich mit Topcase für mehr Stauraum. Bild und vollständige Daten folgen.",
    tagline: "Mit Topcase für mehr Stauraum — Details folgen.",
    image: "/bikes/scooter-50.jpg",
    gallery: ["/bikes/scooter-50.jpg"],
    licence: "B or AM category",
    licenceCode: "AM",
    maxSpeed: "45 km/h",
    extraHour: "6€/h",
    displacement: "50cc",
    power: "~3 PS",
    seats: 2,
    tank: "6,0 L",
    consumption: "~2,5 L / 100 km",
    range: "200–240 km",
    year: "2024",
    pricing: { day: "39€", weekend: "—", week: "—", month: "—" },
    season: "April – October",
    experienceNote: "Driver should be experienced.",
    placeholder: true,
  },
  {
    id: "scooter-125",
    name: "Scooter 125",
    model: "Piaggio Liberty 125 iGet",
    tag: "CITY",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Perfekter Allround-Roller für Stadt und Küste.",
    longDescription:
      "Gleiches komfortables Handling wie der 50er, mit mehr Leistung für Tagestouren entlang der Küste.",
    tagline: "Perfekter Allround-Roller (Stadt + Küste).",
    image: "/bikes/scooter-125.jpg",
    gallery: ["/bikes/scooter-125.jpg"],
    licence: "A1 category",
    licenceCode: "A1",
    maxSpeed: "110 km/h",
    extraHour: "9€/h",
    displacement: "125cc",
    power: "~11 PS (8,1 kW)",
    seats: 2,
    tank: "6,0 L",
    consumption: "~2,5 L / 100 km",
    range: "220–260 km",
    year: "2024",
    pricing: { day: "55€", weekend: "135€", week: "300€", month: "950€" },
    season: "April – October",
  },
  {
    id: "bike-125-a",
    name: "Beta RR 125",
    model: "Beta RR 125 LC",
    tag: "SPORT",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Sportlich und wendig, perfekt für aktive Fahrer.",
    longDescription:
      "Supermoto-Feeling mit 125cc. Leicht, wendig und optimal für sportliche Fahrer, die Kurven und Küstenstraßen lieben.",
    tagline: "Sportlich, aber höherer Verbrauch durch Fahrweise.",
    image: "/bikes/bike-125.jpg",
    gallery: ["/bikes/bike-125.jpg"],
    licence: "A1 category",
    licenceCode: "A1",
    maxSpeed: "100 km/h",
    extraHour: "9€/h",
    displacement: "125cc",
    power: "~15 PS",
    seats: 1,
    tank: "7,5 L",
    consumption: "~3,0–3,5 L / 100 km",
    range: "180–230 km",
    year: "2021",
    pricing: { day: "55€", weekend: "135€", week: "300€", month: "950€" },
    season: "April – October",
    featured: true,
  },
  {
    id: "bike-125-b",
    name: "KTM Duke 125",
    model: "KTM Duke 125",
    tag: "RIDE",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Naked-Bike-Feeling mit großer Reichweite und sportlichem Charakter.",
    longDescription:
      "Echtes Naked-Bike-Feeling mit 125cc. Sehr gute Reichweite, ideal für längere Touren entlang der Küste und auf die Inseln.",
    tagline: "Sehr gute Reichweite – wichtig für Vermietung!",
    image: "/bikes/bike-125-b.jpg",
    gallery: ["/bikes/bike-125-b.jpg"],
    licence: "A1 category",
    licenceCode: "A1",
    maxSpeed: "100 km/h",
    extraHour: "9€/h",
    displacement: "125cc",
    power: "~15 PS",
    seats: 2,
    tank: "11 L",
    consumption: "~2,5–3,0 L / 100 km",
    range: "300–400 km",
    year: "2014",
    pricing: { day: "55€", weekend: "135€", week: "300€", month: "950€" },
    season: "April – October",
  },
  {
    id: "bike-390",
    name: "KTM Duke 390",
    model: "KTM Duke 390",
    tag: "POWER",
    tagColor: "bg-red",
    price: "65€",
    priceUnit: "/day",
    description:
      "A2-ready power for the coast. Light, agile and built for city, country and curves.",
    longDescription:
      "Premium-Bike mit A2-konformer Leistung. Leicht, wendig und perfekt für Stadt, Land und Kurven — ob du nur einen Tag oder den ganzen Monat willst.",
    tagline: "Stark + attraktiv für Touristen (Premium Bike).",
    image: "/bikes/bike-390.jpg",
    gallery: ["/bikes/bike-390.jpg"],
    licence: "A2 category",
    licenceCode: "A2",
    maxSpeed: "140 km/h",
    extraHour: "10€/h",
    displacement: "390cc",
    power: "~44 PS",
    seats: 2,
    tank: "13,4 L",
    consumption: "~3,5–4,0 L / 100 km",
    range: "300–380 km",
    year: "2014",
    pricing: { day: "65€", weekend: "160€", week: "360€", month: "1150€" },
    season: "April – October",
  },
];

// Used for any bike not yet specified
export { PLACEHOLDER_PRICING };

export const REVIEWS: Review[] = [
  {
    id: "1",
    name: "Matija K",
    date: "5 May 2025",
    rating: 5,
    text: "Super welcoming host, we went for a day trip on Ugljan and Pašman island and had an amazing time. Bike was in mint condition. Highly recommend!",
  },
  {
    id: "2",
    name: "Ana Ivanic",
    date: "4 May 2025",
    rating: 5,
    text: "Bikes are beautifully maintained and a joy to ride. We took them along the coast and onto the islands — unforgettable experience. Top service.",
  },
  {
    id: "3",
    name: "Patrick Murphy",
    date: "23 September 2024",
    rating: 5,
    text: "Excellent service. Trustworthy, professional, deposit returned right after drop-off. Easy and straightforward — couldn't recommend more.",
  },
  {
    id: "4",
    name: "Sarah Johnson",
    date: "12 August 2024",
    rating: 5,
    text: "Amazing experience! The bike was perfect and they gave us great tips on where to ride. We rode along the coast to Nin and it was magical.",
  },
  {
    id: "5",
    name: "Marco Bianchi",
    date: "3 July 2024",
    rating: 5,
    text: "Fantastica esperienza! Moto in ottimo stato, assistenza impeccabile. Abbiamo esplorato tutta la costa di Zara. Consigliatissimo per chi vuole girare in libertà.",
  },
];

// Gallery — drop more action shots in public/gallery/ and add them here.
export const GALLERY_IMAGES = [
  "/bikes/bike-390.jpg",
  "/bikes/bike-125.jpg",
  "/bikes/bike-125-b.jpg",
  "/bikes/scooter-125.jpg",
  "/bikes/scooter-50.jpg",
  "/bikes/scooter-50-b.jpg",
];

export const FAQ_ITEMS = [
  {
    question: "What does the breakdown service include?",
    answer:
      "Up to 20 km: free (extra costs apply for accidents or lost keys). Over 20 km: 50€. Islands: Preko 150€, Dugi Otok 500€. Lost key: 50€. Breakdown service applies if you can't return to our address due to an accident or lost key. In case of engine failure we cover all costs.",
  },
  {
    question: "In what condition is the bike delivered?",
    answer:
      "All bikes and scooters are handed over in perfect working condition. We ask renters to inspect the bike, take clear photos and videos at pickup documenting any existing scratches or damage, and return it in the same condition. These recordings are official proof in case of any dispute.",
  },
  {
    question: "What insurance is included?",
    answer:
      "Basic insurance covers theft of the bike and engine damage. Accidents, scratches, damage and flat tires are the renter's responsibility. If a third party causes an accident, you must call the police and obtain an official report — the responsible party is liable.",
  },
  {
    question: "What is your cancellation policy?",
    answer:
      "All bookings are non-refundable. The 20% reservation fee secures your dates and is not returned in case of cancellation. If a bike becomes unavailable due to an accident or damage caused by another client, we'll cancel and refund in full.",
  },
  {
    question: "When and where do I return the bike?",
    answer:
      "At the agreed time and location. We give a 15-minute grace period — late returns beyond that incur extra fees. Drop-off at our address: Velebitska Ulica 2, 23000 Zadar.",
  },
  {
    question: "Who is responsible for accidents or injuries?",
    answer:
      "The renter assumes full responsibility for all accidents, damages or injuries that occur during the rental period.",
  },
  {
    question: "What happens if the bike is damaged?",
    answer:
      "The deposit covers initial repair costs. The bike is inspected and repaired by a brand dealership and the renter pays the full repair costs per the workshop invoice. If repairs exceed the deposit, the renter pays the difference. A copy of the invoice is provided.",
  },
  {
    question: "What if I lose the key?",
    answer:
      "A replacement key will be delivered for 50€ plus any applicable breakdown service fee depending on your location.",
  },
  {
    question: "How do I make a reservation?",
    answer:
      "Always confirm availability with us first — it can change quickly. A 20% booking fee secures your dates. Pay via PayPal, bank transfer, Revolut or cash on arrival. After paying, send us a screenshot of the transaction. If you arrive more than 1 hour late without notice, the reservation is automatically cancelled. We don't accept credit cards.",
  },
  {
    question: "Do you offer phone holders?",
    answer:
      "No. We don't offer or fit phone holders. None of our bikes come with one — please plan your route before you head out.",
  },
];

// Mock blocked date ranges for the booking calendar
// Simulates already-booked periods per category
export const BLOCKED_DATES_SCOOTER_50: BlockedRange[] = [
  { from: new Date(2026, 4, 5), to: new Date(2026, 4, 8) },
  { from: new Date(2026, 4, 18), to: new Date(2026, 4, 22) },
  { from: new Date(2026, 5, 1), to: new Date(2026, 5, 4) },
];

export const BLOCKED_DATES_SCOOTER_125: BlockedRange[] = [
  { from: new Date(2026, 4, 10), to: new Date(2026, 4, 14) },
  { from: new Date(2026, 5, 5), to: new Date(2026, 5, 9) },
  { from: new Date(2026, 5, 25), to: new Date(2026, 5, 29) },
];

export const BLOCKED_DATES_BIKE_125: BlockedRange[] = [
  { from: new Date(2026, 4, 12), to: new Date(2026, 4, 16) },
  { from: new Date(2026, 5, 10), to: new Date(2026, 5, 14) },
  { from: new Date(2026, 6, 3), to: new Date(2026, 6, 8) },
];

export const BLOCKED_DATES_BIKE_390: BlockedRange[] = [
  { from: new Date(2026, 4, 20), to: new Date(2026, 4, 25) },
  { from: new Date(2026, 5, 15), to: new Date(2026, 5, 20) },
  { from: new Date(2026, 6, 10), to: new Date(2026, 6, 15) },
];

export const BLOCKED_BY_ID: Record<string, BlockedRange[]> = {
  "scooter-50": BLOCKED_DATES_SCOOTER_50,
  "scooter-50-topcase": BLOCKED_DATES_SCOOTER_50,
  "scooter-125": BLOCKED_DATES_SCOOTER_125,
  "bike-125-a": BLOCKED_DATES_BIKE_125,
  "bike-125-b": BLOCKED_DATES_BIKE_125,
  "bike-390": BLOCKED_DATES_BIKE_390,
};

// Brand info
export type Contact = {
  label: string;
  phone: string;
  phoneRaw: string;
  languages: string[];
  placeholder?: boolean;
};

export const BRAND = {
  name: "SickMotos",
  tagline: "Rent a Moto",
  legal: "Joyful d.o.o.",
  oib: "84055846851",
  address: "Velebitska Ulica 2, 23000 Zadar",
  hours: "09:00 — 19:00, Monday to Sunday",
  phone: "+49 176 34658003",
  phoneRaw: "4917634658003",
  languages: ["🇩🇪", "🇬🇧"],
  email: "info@sickmotos.com",
  instagram: "sickmotos_bike_rental_zadar",
  instagramUrl: "https://instagram.com/sickmotos_bike_rental_zadar",
  reviewsUrl: "https://maps.app.goo.gl/XCr6kKfFqrfR1PXR6?g_st=ic",
  deposit: "250€",
  noPhoneHolder: true,
  contacts: [
    {
      label: "Primary",
      phone: "+49 176 34658003",
      phoneRaw: "4917634658003",
      languages: ["🇩🇪", "🇬🇧"],
    },
    {
      label: "Alternate",
      phone: "Coming soon",
      phoneRaw: "",
      languages: ["🇩🇪", "🇬🇧"],
      placeholder: true,
    },
  ] satisfies Contact[],
};
