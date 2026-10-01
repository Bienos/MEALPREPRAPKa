/**
 * Shown the moment a tab is tapped, while the server prepares the screen.
 * Shapes only, roughly where every tab puts its header and cards.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Ładowanie" className="flex animate-pulse flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-32 rounded-lg bg-muted" />
        <div className="h-4 w-48 rounded-md bg-muted" />
      </div>
      <div className="h-24 rounded-3xl bg-muted" />
      <div className="h-72 rounded-3xl bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-14 rounded-2xl bg-muted" />
        <div className="h-14 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
