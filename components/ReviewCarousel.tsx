"use client";

import { useEffect, useRef, useState } from "react";
import type { Review } from "@/lib/mockData";

// Minimum horizontal travel in pixels before we treat a touch as a swipe.
// Below this the gesture is just tap-jitter and shouldn't change photos.
const SWIPE_THRESHOLD_PX = 50;

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const StarIcon = () => (
  <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

type LightboxState = { photos: string[]; index: number; name: string };

export default function ReviewCarousel({ reviews }: { reviews: Review[] }) {
  const [page, setPage] = useState(0);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const perPage = 3;
  const totalPages = Math.ceil(reviews.length / perPage);
  const visible = reviews.slice(page * perPage, page * perPage + perPage);

  // ESC closes, arrows step through the current review's photos. Body
  // scroll is locked while open so the page underneath doesn't jump.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowLeft") {
        setLightbox((l) => (l ? { ...l, index: Math.max(0, l.index - 1) } : null));
      } else if (e.key === "ArrowRight") {
        setLightbox((l) =>
          l ? { ...l, index: Math.min(l.photos.length - 1, l.index + 1) } : null,
        );
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  const openLightbox = (review: Review, startIndex: number) => {
    if (!review.photos || review.photos.length === 0) return;
    setLightbox({ photos: review.photos, index: startIndex, name: review.name });
  };
  const close = () => setLightbox(null);
  const step = (delta: number) =>
    setLightbox((l) =>
      l ? { ...l, index: Math.max(0, Math.min(l.photos.length - 1, l.index + delta)) } : null,
    );

  // Touch swipe inside the lightbox. We just record startX on touchstart
  // and decide on touchend — no need for live tracking; the user gets
  // the snap behaviour they expect from any gallery app.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    step(dx < 0 ? 1 : -1);
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {visible.map((review) => (
          <div key={review.id} className="bg-sand p-6">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-3 min-w-0">
                {review.avatar ? (
                  <img
                    src={review.avatar}
                    alt={review.name}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-ink/10 text-ink/60 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {review.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-sm truncate">{review.name}</p>
                  <p className="text-muted text-xs mt-0.5">{review.date}</p>
                </div>
              </div>
              <GoogleIcon />
            </div>

            <div className="flex items-center gap-0.5 mb-4">
              {Array.from({ length: review.rating }).map((_, i) => (
                <StarIcon key={i} />
              ))}
            </div>

            <p className="text-ink/70 text-sm leading-relaxed">{review.text}</p>

            {review.photos && review.photos.length > 0 && (
              <div className="mt-4 flex gap-2">
                {review.photos.slice(0, 3).map((src, i) => {
                  const showOverflow = i === 2 && review.photos!.length > 3;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openLightbox(review, i)}
                      className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] overflow-hidden flex-shrink-0 group"
                      aria-label={`Open photo ${i + 1}`}
                    >
                      <img
                        src={src}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                      />
                      {showOverflow && (
                        <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-bold">
                          +{review.photos!.length - 3}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-9 h-9 border border-ink/20 text-ink/40 flex items-center justify-center hover:border-red hover:text-red disabled:opacity-25 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex gap-2">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === page ? "bg-red w-6" : "bg-ink/20 w-1.5"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="w-9 h-9 border border-ink/20 text-ink/40 flex items-center justify-center hover:border-red hover:text-red disabled:opacity-25 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 sm:p-8 touch-pan-y"
          onClick={close}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {lightbox.index > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous photo"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {lightbox.index < lightbox.photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next photo"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <img
            src={lightbox.photos[lightbox.index]}
            alt={`${lightbox.name} photo ${lightbox.index + 1}`}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {lightbox.photos.length > 1 && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-xs tracking-widest font-medium">
              {lightbox.index + 1} / {lightbox.photos.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
