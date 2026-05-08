import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { GALLERY_IMAGES } from "@/lib/mockData";

export default function GalleryPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-24 md:pb-16 min-h-screen">

        {/* Header */}
        <div className="px-5 md:px-12 max-w-7xl mx-auto mb-10">
          <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
            Real riders, real moments
          </p>
          <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,7rem)] leading-none tracking-tight text-ink">
            Gallery
          </h1>
        </div>

        {/* Masonry - show every image in full */}
        <div className="px-5 md:px-12 max-w-7xl mx-auto">
          <div className="columns-2 md:columns-3 gap-3 [&>div]:mb-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className="break-inside-avoid overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Gallery ${i + 1}`}
                  loading="lazy"
                  className="w-full h-auto block group-hover:scale-[1.02] transition-transform duration-700"
                />
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-5 md:px-12 max-w-7xl mx-auto mt-16">
          <div className="bg-ink px-8 py-12 md:py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <p className="text-white/50 text-xs tracking-widest uppercase mb-2">Join the adventure</p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] leading-none tracking-tight text-white">
                Your Turn to Ride
              </h2>
            </div>
            <Link
              href="/#fleet"
              className="shrink-0 bg-red text-white font-bold text-xs tracking-widest uppercase px-8 py-4 hover:bg-red-dark transition-colors"
            >
              Book Now →
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
