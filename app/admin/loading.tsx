// Shown inside the admin frame while a page's data loads (every admin page reads the database). Roughly the shape of a page:
// a title, a row of tiles and a couple of panels, so the layout doesn't jump when the real page arrives.
const Bar = ({ className = '' }: { className?: string }) => <div className={`rounded-lg bg-white/5 animate-pulse ${className}`} />;

export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2"><Bar className="h-8 w-56" /><Bar className="h-4 w-96 max-w-full" /></div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Bar key={i} className="h-20 rounded-xl" />)}</div>
      <div className="grid gap-6 xl:grid-cols-2"><Bar className="h-64 rounded-2xl" /><Bar className="h-64 rounded-2xl" /></div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
