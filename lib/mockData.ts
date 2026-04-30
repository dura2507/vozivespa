export type Category = {
  id: string;
  name: string;
  tag: string;
  tagColor: string;
  price: string;
  priceUnit: string;
  description: string;
  image: string;
  licence: string;
  maxSpeed: string;
  extraHour: string;
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

// NOTE: bike photos are placeholders. Replace with the real photos at
// public/bikes/{scooter-50,scooter-125,bike-125,bike-390}.jpg or update
// the `image` URLs below.
export const CATEGORIES: Category[] = [
  {
    id: "scooter-50",
    name: "Scooter 50",
    tag: "BEGINNER",
    tagColor: "bg-red",
    price: "39€",
    priceUnit: "/day",
    description:
      "Black Piaggio Liberty 50cc. Perfect for cruising the city — easy to handle, ideal for first-time riders.",
    image:
      "https://images.unsplash.com/photo-1568708998037-69d0c1f13e25?w=1200&q=80",
    licence: "B or AM category",
    maxSpeed: "45 km/h",
    extraHour: "6€/h",
  },
  {
    id: "scooter-125",
    name: "Scooter 125",
    tag: "CITY",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "125cc scooter — same easy handling as the 50, more power for highways and longer day trips.",
    image:
      "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1200&q=80",
    licence: "A1 category",
    maxSpeed: "110 km/h",
    extraHour: "9€/h",
  },
  {
    id: "bike-125",
    name: "Motobike 125",
    tag: "RIDE",
    tagColor: "bg-red",
    price: "55€",
    priceUnit: "/day",
    description:
      "Real motorbike feeling with 125cc. Great for confident riders looking to explore the coastal roads.",
    image:
      "https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?w=1200&q=80",
    licence: "A1 category",
    maxSpeed: "100 km/h",
    extraHour: "9€/h",
    featured: true,
  },
  {
    id: "bike-390",
    name: "Motobike 390",
    tag: "POWER",
    tagColor: "bg-red",
    price: "65€",
    priceUnit: "/day",
    description:
      "Top-of-the-range 390cc bike. Highway-ready performance for experienced riders who want the full experience.",
    image:
      "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=1200&q=80",
    licence: "A2 category",
    maxSpeed: "140 km/h",
    extraHour: "10€/h",
  },
];

export type AddOn = {
  label: string;
  price: string;
  detail: string;
};

export const ADD_ONS: AddOn[] = [
  {
    label: "In-Ear Navigation",
    price: "+10€",
    detail: "Bluetooth in-ear set so you get turn-by-turn directions without taking your eyes off the road.",
  },
  {
    label: "Premium Helmet",
    price: "+15€",
    detail: "Upgrade from the standard helmet to a premium open-face or full-face helmet with sun visor.",
  },
  {
    label: "Secret Locations Map",
    price: "+5€",
    detail: "Curated map of hidden beaches, viewpoints and restaurants only locals know about.",
  },
];

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

// NOTE: gallery photos are placeholders. Replace with real shots of the bikes
// and rides — drop them in public/gallery/ and update the URLs below.
export const GALLERY_IMAGES = [
  "https://images.unsplash.com/photo-1568708998037-69d0c1f13e25?w=1200&q=80",
  "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1200&q=80",
  "https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?w=1200&q=80",
  "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=1200&q=80",
  "https://images.unsplash.com/photo-1547549082-6bc09f2049ae?w=1200&q=80",
  "https://images.unsplash.com/photo-1605236453806-6ff36851218e?w=1200&q=80",
  "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=1200&q=80",
  "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=1200&q=80",
  "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&q=80",
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
  "scooter-125": BLOCKED_DATES_SCOOTER_125,
  "bike-125": BLOCKED_DATES_BIKE_125,
  "bike-390": BLOCKED_DATES_BIKE_390,
};

// Brand info
export const BRAND = {
  name: "SickMotos",
  tagline: "Rent a Moto",
  legal: "Joyful d.o.o.",
  oib: "84055846851",
  address: "Velebitska Ulica 2, 23000 Zadar",
  hours: "09:00 — 19:00, Monday to Sunday",
  phone: "+385 95 819 5453",
  phoneRaw: "385958195453",
  email: "info@sickmotos.com",
  instagram: "sickmotos_bike_rental_zadar",
  instagramUrl: "https://instagram.com/sickmotos_bike_rental_zadar",
  reviewsUrl: "https://maps.app.goo.gl/XCr6kKfFqrfR1PXR6?g_st=ic",
};
