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
  // Compact label for admin lists where the full model overflows the
  // card. Customer-facing pages keep using model. Falls back to name.
  shortName?: string;
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
  imageFit?: "cover" | "contain";
};

export type Review = {
  id: string;
  name: string;
  date: string;
  rating: number;
  text: string;
};

export const LICENCE_BADGE: Record<string, string> = {
  "A1": "/badges/licence-a1.png",
  "A2": "/badges/licence-a2.png",
  "AM/B": "/badges/licence-am-b.png",
};

export const CATEGORIES: Category[] = [
  {
    id: "scooter-50",
    name: "Piaggio Liberty 50",
    model: "Piaggio Liberty 50 iGet",
    shortName: "Liberty 50",
    tag: "CITY RIDE",
    tagColor: "bg-red",
    price: "35€",
    priceUnit: "/day",
    description:
      "Light on fuel, easy to handle, perfect for the city.",
    longDescription:
      "Very fuel-efficient, easy to handle and perfect for relaxed cruising through Zadar and along the coast.",
    tagline: "Fuel-friendly. Previous riding experience required.",
    image: "/bikes/scooter-50.jpg",
    gallery: ["/bikes/scooter-50.jpg"],
    licence: "AM or B category",
    licenceCode: "AM/B",
    maxSpeed: "45 km/h",
    extraHour: "6€/h",
    displacement: "50cc",
    power: "~3 PS",
    seats: 2,
    tank: "6,0 L",
    consumption: "~2,5 L / 100 km",
    range: "200-240 km",
    year: "2024",
    pricing: { day: "35€", weekend: "85€", week: "190€", month: "620€" },
    season: "April to October",
    experienceNote: "Previous riding experience required. No first-time riders.",
  },
  {
    id: "scooter-50-topcase",
    name: "Piaggio Liberty 50 Topcase",
    model: "Piaggio Liberty 50 iGet, Topcase",
    shortName: "Liberty 50 TC",
    tag: "CITY RIDE",
    tagColor: "bg-red",
    price: "39€",
    priceUnit: "/day",
    description:
      "Piaggio Liberty 50 with topcase, extra storage.",
    longDescription:
      "Same Liberty 50 as the standard, fitted with a topcase for extra storage on longer rides.",
    tagline: "Topcase included, extra storage.",
    image: "/bikes/scooter-50-topcase.jpg",
    gallery: ["/bikes/scooter-50-topcase.jpg"],
    licence: "AM or B category",
    licenceCode: "AM/B",
    maxSpeed: "45 km/h",
    extraHour: "6€/h",
    displacement: "50cc",
    power: "~3 PS",
    seats: 2,
    tank: "6,0 L",
    consumption: "~2,5 L / 100 km",
    range: "200-240 km",
    year: "2024",
    pricing: { day: "39€", weekend: "95€", week: "210€", month: "690€" },
    season: "April to October",
    experienceNote: "Previous riding experience required. No first-time riders.",
  },
  {
    id: "scooter-125",
    name: "Piaggio Liberty 125",
    model: "Piaggio Liberty 125 iGet",
    shortName: "Liberty 125",
    tag: "CITY",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Perfect all-rounder for city and coastal rides.",
    longDescription:
      "Same easy handling as the 50, with more power for day trips along the coast.",
    tagline: "All-rounder for city and coast.",
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
    range: "220-260 km",
    year: "2024",
    pricing: { day: "55€", weekend: "135€", week: "300€", month: "950€" },
    season: "April to October",
  },
  {
    id: "bike-125-a",
    name: "Beta RR 125",
    model: "Beta RR 125 LC",
    shortName: "Beta RR 125",
    tag: "SPORT",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Sporty and agile, made for active riders.",
    longDescription:
      "Supermoto feel with 125cc. Light, agile and ideal for spirited riders who love curves and coastal roads.",
    tagline: "Sporty. Higher fuel use due to riding style.",
    image: "/bikes/bike-125.jpg",
    gallery: ["/bikes/bike-125.jpg", "/bikes/bike-125-c.jpg"],
    licence: "A1 category",
    licenceCode: "A1",
    maxSpeed: "100 km/h",
    extraHour: "9€/h",
    displacement: "125cc",
    power: "~15 PS",
    seats: 1,
    tank: "7,5 L",
    consumption: "~3,0-3,5 L / 100 km",
    range: "180-230 km",
    year: "2021",
    pricing: { day: "55€", weekend: "135€", week: "300€", month: "950€" },
    season: "April to October",
    featured: true,
  },
  {
    id: "bike-125-b",
    name: "KTM Duke 125",
    model: "KTM Duke 125",
    shortName: "Duke 125",
    tag: "RIDE",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Naked-bike feel with great range and sporty character.",
    longDescription:
      "Real naked-bike character at 125cc. Excellent range, perfect for longer tours along the coast and to the islands.",
    tagline: "Great range, perfect for longer trips.",
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
    consumption: "~2,5-3,0 L / 100 km",
    range: "300-400 km",
    year: "2014",
    pricing: { day: "55€", weekend: "135€", week: "300€", month: "950€" },
    season: "April to October",
  },
  {
    id: "bike-390",
    name: "KTM Duke 390",
    model: "KTM Duke 390",
    shortName: "Duke 390",
    tag: "POWER",
    tagColor: "bg-red",
    price: "65€",
    priceUnit: "/day",
    description:
      "A2-ready power for the coast. Light, agile, built for city, country and curves.",
    longDescription:
      "Premium A2-compliant bike. Light, agile and perfect for city, country and curves, whether you want it for a day or the full month.",
    tagline: "Strong and premium. Top pick for confident riders.",
    image: "/bikes/bike-390.jpg",
    gallery: ["/bikes/bike-390.jpg", "/bikes/bike-390-b.jpg", "/bikes/bike-390-c.jpg"],
    licence: "A2 category",
    licenceCode: "A2",
    maxSpeed: "140 km/h",
    extraHour: "10€/h",
    displacement: "390cc",
    power: "~44 PS",
    seats: 2,
    tank: "13,4 L",
    consumption: "~3,5-4,0 L / 100 km",
    range: "300-380 km",
    year: "2014",
    pricing: { day: "65€", weekend: "160€", week: "360€", month: "1150€" },
    season: "April to October",
  },
];

export const REVIEWS: Review[] = [
  {
    id: "1",
    name: "Konrad Jakubowski",
    date: "10 May 2026",
    rating: 5,
    text: "Sehr freundlicher Service! Sehr nette Besitzer! Alles lief reibungslos und die Fahrräder sind in einem hervorragenden Zustand! Absolut empfehlenswert!",
  },
  {
    id: "2",
    name: "Szymon Rosol",
    date: "9 May 2026",
    rating: 5,
    text: "Perfekter Ort, wenn man ein gutes Motorrad zu günstigen Preisen sucht :) Ich habe mir eine Duke 390 geholt und war total begeistert. Bin an einem Tag 250 km gefahren. Es gab keinerlei Probleme mit dem Motorrad, und die Kommunikation mit dem Besitzer über WhatsApp war schnell und professionell.",
  },
  {
    id: "3",
    name: "Stijn Zeeuwen",
    date: "5 May 2026",
    rating: 5,
    text: "Ich habe mit meinen Freunden hier vier Motorräder gemietet und kann den Verleih wirklich empfehlen! Der Service ist super und die Mitarbeiter sind sehr freundlich. Außerdem sind die Preise für die Roller echt gut! Wir sind zu den Krka-Wasserfällen gefahren, ein tolles Ausflugsziel mit den Motorrädern.",
  },
  {
    id: "4",
    name: "luis mclaren",
    date: "4 May 2026",
    rating: 5,
    text: "Fantastischer Fahrradverleih! Super hilfsbereit und zuvorkommend mit tollen Tipps und Empfehlungen für die Umgebung. Absolut empfehlenswert.",
  },
  {
    id: "5",
    name: "Stijn Peerlings",
    date: "20 April 2026",
    rating: 5,
    text: "Wir haben heute drei Roller gemietet, die in einem guten Zustand waren. Die Mitarbeiter der Vermietung waren sehr freundlich und haben uns ein paar Tipps für Ausflüge gegeben. Absolut empfehlenswert!",
  },
];

// Gallery. Drop more action shots in public/gallery/ and add them here.
export const GALLERY_IMAGES = [
  "/gallery/duke-with-dog.jpg",
  "/gallery/bike-390-coast.jpg",
  "/gallery/group-ride.jpg",
  "/gallery/mountain-ride.jpg",
  "/gallery/duke-marina.jpg",
  "/gallery/sunset-bikes.jpg",
  "/gallery/tunnel.jpg",
  "/gallery/cliff-pair.jpg",
  "/gallery/liberty-sea.jpg",
  "/gallery/duke-twilight.jpg",
  "/gallery/runway.jpg",
  "/gallery/selfie-pov.jpg",
  "/gallery/beta-trail.jpg",
  "/gallery/duke-rider.jpg",
  "/gallery/bus-window.jpg",
  "/gallery/liberty-island.jpg",
  "/gallery/bike-390-bay.jpg",
  "/gallery/liberty-olive.jpg",
  "/gallery/liberty-grass.jpg",
  "/gallery/piaggio-plitvice.jpg",
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
      "Basic insurance covers theft of the bike and engine damage. Accidents, scratches, damage and flat tires are the renter's responsibility. If a third party causes an accident, you must call the police and obtain an official report. The responsible party is liable.",
  },
  {
    question: "What is your cancellation policy?",
    answer:
      "All bookings are non-refundable. The 20% reservation fee secures your dates and is not returned in case of cancellation. If a bike becomes unavailable due to an accident or damage caused by another client, we'll cancel and refund in full.",
  },
  {
    question: "When and where do I return the bike?",
    answer:
      "At the agreed time and location. We give a 15-minute grace period. Late returns beyond that incur extra fees. Drop-off at our address: Velebitska Ulica 2, 23000 Zadar.",
  },
  {
    question: "Who is responsible for accidents or injuries?",
    answer:
      "The renter assumes full responsibility for all accidents, damages or injuries that occur during the rental period.",
  },
  {
    question: "What happens if the bike is damaged?",
    answer:
      "The deposit covers initial repair costs. We take the bike to a local mechanic for assessment and repair, and the renter pays the full repair costs per the mechanic's invoice. If repairs exceed the deposit, the renter pays the difference. A copy of the invoice is always provided for transparency.",
  },
  {
    question: "What if I lose the key?",
    answer:
      "A replacement key will be delivered for 50€ plus any applicable breakdown service fee depending on your location.",
  },
  {
    question: "How do I make a reservation?",
    answer:
      "Always confirm availability with us first. It can change quickly. A 20% booking fee secures your dates. Pay via PayPal, bank transfer, Revolut or cash on arrival. After paying, send us a screenshot of the transaction. If you arrive more than 1 hour late without notice, the reservation is automatically cancelled. We don't accept credit cards.",
  },
  {
    question: "Do you offer phone holders?",
    answer:
      "No. We don't offer or fit phone holders, and you can't bring your own either. None of our bikes come with one. Please plan your route before you head out.",
  },
  {
    question: "How does the fuel work, full tank or empty tank?",
    answer:
      "Every bike is handed over with a full tank. Please return it with a full tank as well. If you return the bike not fully fuelled, we charge the missing fuel plus a refuelling fee.",
  },
  {
    question: "How do I navigate without a phone holder?",
    answer:
      "Two practical options: ride with a passenger (Sozius) who handles directions, or use a Bluetooth in-ear navigation set for turn-by-turn audio without taking your eyes off the road. Either way, plan your route before pickup.",
  },
  {
    question: "What if you decide I'm not experienced enough?",
    answer:
      "Riding requires prior experience. If at pickup we determine you don't have enough experience to safely handle the bike, we reserve the right to decline the rental. In that case the booking fee is non-refundable, so please be honest about your experience when booking.",
  },
];

// Brand info
export type Contact = {
  label: string;
  phone: string;
  phoneRaw: string;
  languages: string[];
  placeholder?: boolean;
};

export type PaymentMethod = {
  id: "paypal_ff" | "paypal_company" | "bank";
  label: string;
  // Headline value (email or IBAN). Shown formatted for humans.
  value: string;
  // Optional override for what gets put on the clipboard , e.g.
  // IBAN with spaces displayed but bare digits copied so banking
  // apps don't choke.
  valueCopy?: string;
  // Field label for `value` ("IBAN", "Email", etc).
  valueLabel?: string;
  // Optional second copyable field, typically the account holder.
  subValue?: string;
  subValueLabel?: string;
  // Short note shown beneath the option (fees, instructions, etc.).
  note?: string;
  // Recommended option appears first and is highlighted.
  recommended?: boolean;
};

export const BRAND = {
  name: "SickMotos",
  tagline: "Rent a Moto",
  legal: "Joyful d.o.o.",
  oib: "84055846851",
  address: "Velebitska Ulica 2, 23000 Zadar",
  hours: "Mon-Sun, 09:00-19:00",
  phone: "+49 176 34658003",
  phoneRaw: "4917634658003",
  languages: ["🇩🇪", "🇬🇧"],
  email: "info@sickmotos.com",
  instagram: "sickmotos_bike_rental_zadar",
  instagramUrl: "https://instagram.com/sickmotos_bike_rental_zadar",
  reviewsUrl: "https://maps.app.goo.gl/XCr6kKfFqrfR1PXR6?g_st=ic",
  deposit: "250€",
  noPhoneHolder: true,
  payment: [
    {
      id: "paypal_ff",
      label: "PayPal · Friends & Family",
      valueLabel: "Email",
      value: "priscilla_sebastiani@yahoo.com.br",
      note: "No fee. Use Friends & Family option.",
      recommended: true,
    },
    {
      id: "paypal_company",
      label: "PayPal · Company",
      valueLabel: "Email",
      value: "Ktoms_braap284@freenet.de",
      note: "Standard PayPal , small fee applies.",
    },
    {
      id: "bank",
      label: "Bank Transfer (SEPA)",
      valueLabel: "IBAN",
      value: "DE71 7205 0000 0240 7231 30",
      valueCopy: "DE71720500000240723130",
      subValueLabel: "Account holder",
      subValue: "Thomas Krawietz",
      note: "Use instant transfer. Currency conversion may add a fee.",
    },
  ] satisfies PaymentMethod[] as PaymentMethod[],
  contacts: [
    {
      label: "Deutsch",
      phone: "+49 176 34658003",
      phoneRaw: "4917634658003",
      languages: ["🇩🇪"],
    },
    {
      label: "English",
      phone: "+385 95 8195 453",
      phoneRaw: "385958195453",
      languages: ["🇬🇧"],
    },
  ] as Contact[],
};
