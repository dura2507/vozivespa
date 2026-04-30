export type Category = {
  id: string;
  name: string;
  tag: string;
  tagColor: string;
  price: string;
  priceUnit: string;
  description: string;
  image: string;
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

export const CATEGORIES: Category[] = [
  {
    id: "picnic",
    name: "Picnic",
    tag: "TASTE",
    tagColor: "bg-coral",
    price: "60€",
    priceUnit: "",
    description:
      "Venture out into the beauty of nature with a picnic to enjoy life & special carefree moments. *Vespa Rental Required*",
    image: "https://vozivespa.com/wp-content/uploads/2025/03/picnic-bg-main.jpg",
  },
  {
    id: "vespa150",
    name: "Vespa 150",
    tag: "EXPLORE",
    tagColor: "bg-vespa",
    price: "80€",
    priceUnit: "/day",
    description:
      "With advanced features and designed to deliver first-class stability and performance, it is the supreme mode of transportation.",
    image: "https://vozivespa.com/wp-content/uploads/2025/06/vespa-150.jpg",
    featured: true,
  },
  {
    id: "vespa50",
    name: "Vespa 50",
    tag: "CRUISE",
    tagColor: "bg-coral",
    price: "50€",
    priceUnit: "/day",
    description:
      "Zip through sun filled city streets to reach the beach on a sporty and nimble Vespa with a smooth and comfortable ride.",
    image: "https://vozivespa.com/wp-content/uploads/2025/06/vespa-50v3.jpg",
  },
];

export const INCLUDED_INFO = {
  title: "Whats Included",
  image: "https://vozivespa.com/wp-content/uploads/2025/06/vespa-150.jpg",
  items: [
    { label: "Helmets", detail: "Your choice of one or two helmets." },
    { label: "Phone Holders", detail: "Our Vespas come with mobile phone holders." },
    { label: "Kilometers", detail: "No driving limits." },
    { label: "Insurance", detail: "Basic coverage is provided with each Vespa rental." },
    { label: "Assistance", detail: "Roadside assistance within Zadar region only." },
    { label: "Taxes", detail: "No hidden fees, what you see is what you pay." },
  ],
};

export const INCLUDED_VESPA = {
  title: "About the Vespa",
  image: "https://vozivespa.com/wp-content/uploads/2025/06/vespa-50v3.jpg",
  items: [
    { label: "Vespa 150cc", detail: "Powerful, smooth, perfect for island trips." },
    { label: "Vespa 50cc", detail: "Nimble city cruiser, no licence required." },
    { label: "Storage", detail: "Under-seat storage for essentials." },
    { label: "Phone Holder", detail: "Handlebar mount included." },
    { label: "Full Tank", detail: "Each rental starts with a full tank of fuel." },
    { label: "Delivery", detail: "Delivery to your hotel available on request." },
  ],
};

export const INCLUDED_PICNIC = {
  title: "Picnic Package",
  image: "https://vozivespa.com/wp-content/uploads/2025/03/picnic-bg-main.jpg",
  items: [
    { label: "Picnic Basket", detail: "Beautifully packed wicker basket." },
    { label: "Blanket", detail: "Soft picnic blanket for two." },
    { label: "Local Snacks", detail: "Dalmatian cheeses, prosciutto, olives." },
    { label: "Wine & Water", detail: "Local wine + still water included." },
    { label: "Recommendations", detail: "Our favourite hidden spots on the coast." },
    { label: "Vespa Required", detail: "Must be booked together with a Vespa rental." },
  ],
};

export const REVIEWS: Review[] = [
  {
    id: "1",
    name: "Matija K",
    date: "5 May 2025",
    rating: 5,
    text: "Steven is a nice host, we went for a day trip on Ugljan and Pašman island and had amazing time. We would recommend it for everyone looking to explore the islands in style!",
  },
  {
    id: "2",
    name: "Ana Ivanic",
    date: "4 May 2025",
    rating: 5,
    text: "Vespe su predivne i odlicno ocuvane. Bilo ih je gust vozit i ici sa njima na otok vozit se uz more. Predivno iskustvo. Domacin izvanredan, sve preporucujem!",
  },
  {
    id: "3",
    name: "Patrick Murphy",
    date: "23 September 2024",
    rating: 5,
    text: "Excellent service. Very nice and trustworthy guy. Sent the full deposit back straight away when we returned the Vespas. Very easy straightforward process. Highly recommended!",
  },
  {
    id: "4",
    name: "Sarah Johnson",
    date: "12 August 2024",
    rating: 5,
    text: "Amazing experience! The Vespa was in perfect condition and Steven gave great tips on where to go. We rode along the coast to Nin and it was absolutely magical. Will book again next summer!",
  },
  {
    id: "5",
    name: "Marco Bianchi",
    date: "3 July 2024",
    rating: 5,
    text: "Fantastica esperienza! Vespas in ottimo stato, assistenza impeccabile. Abbiamo esplorato tutta la costa di Zara in mezza giornata. Consigliatissimo per chi vuole girare in libertà.",
  },
];

export const GALLERY_IMAGES = [
  "https://vozivespa.com/wp-content/uploads/2025/03/gallery-1.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/gallery-2.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/gallery-3.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/gallery-4.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/gallery-5.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/gallery-6.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/gopro-10a.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/03/pexels-jaralol-17406443-scaled.jpg",
  "https://vozivespa.com/wp-content/uploads/2025/06/vespa-50v3.jpg",
];

export const FAQ_ITEMS = [
  {
    question: "Do I need a driving licence to rent a Vespa?",
    answer:
      "For the Vespa 50cc, you only need a valid car licence (B category). For the Vespa 150cc, you need a valid motorcycle licence (A or A1 category). We check licences at pick-up.",
  },
  {
    question: "What is the minimum rental period?",
    answer:
      "The minimum rental period is 1 day (24 hours). You can also rent for half a day (4 hours) — contact us for pricing.",
  },
  {
    question: "Where do I pick up the Vespa?",
    answer:
      "Pick-up is in Zadar city centre. Exact address is confirmed upon booking. Delivery to your hotel or accommodation is available for an additional fee.",
  },
  {
    question: "What happens if I have an accident?",
    answer:
      "Basic insurance is included with every rental. In case of an accident, contact us immediately. A deposit is held at the start of the rental as security.",
  },
  {
    question: "Can I take the Vespa to the islands?",
    answer:
      "Yes! Many guests take our Vespas on the ferry to Ugljan, Pašman and other nearby islands. Just let us know in advance and we'll provide tips for a great island day trip.",
  },
  {
    question: "Is a deposit required?",
    answer:
      "Yes, a refundable security deposit is required upon pick-up. It is returned in full when the Vespa is returned undamaged and on time.",
  },
  {
    question: "Can I cancel or reschedule my booking?",
    answer:
      "Free cancellation up to 48 hours before pick-up. Cancellations within 48 hours may forfeit the deposit. We're flexible — just contact us and we'll do our best.",
  },
];

// Mock blocked date ranges for the booking calendar
// These simulate already-booked periods
export const BLOCKED_DATES_150: BlockedRange[] = [
  { from: new Date(2026, 4, 5), to: new Date(2026, 4, 8) },   // May 5-8
  { from: new Date(2026, 4, 18), to: new Date(2026, 4, 22) }, // May 18-22
  { from: new Date(2026, 5, 1), to: new Date(2026, 5, 4) },   // June 1-4
  { from: new Date(2026, 5, 14), to: new Date(2026, 5, 18) }, // June 14-18
  { from: new Date(2026, 6, 3), to: new Date(2026, 6, 8) },   // July 3-8
];

export const BLOCKED_DATES_50: BlockedRange[] = [
  { from: new Date(2026, 4, 10), to: new Date(2026, 4, 14) }, // May 10-14
  { from: new Date(2026, 5, 5), to: new Date(2026, 5, 9) },   // June 5-9
  { from: new Date(2026, 5, 25), to: new Date(2026, 5, 29) }, // June 25-29
  { from: new Date(2026, 6, 10), to: new Date(2026, 6, 15) }, // July 10-15
];
