// Instant skeleton shown the moment the owner taps a nav item, while the
// server fetches the page's data. Without this the previous page just
// froze for a beat on every switch — felt slow on mobile.
export default function AdminLoading() {
  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 animate-pulse" aria-hidden>
      <div className="h-9 w-48 bg-ink/10 rounded mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-ink/5 border border-ink/10 rounded" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-ink/5 border border-ink/10 rounded" />
        ))}
      </div>
    </div>
  );
}
