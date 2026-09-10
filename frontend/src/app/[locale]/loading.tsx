export default function LocaleLoading() {
  return (
    <main className="shell py-10" aria-busy aria-live="polite">
      <div className="h-44 animate-pulse rounded-3xl border border-border bg-white/5" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-52 animate-pulse rounded-2xl border border-border bg-white/[.035]"
          />
        ))}
      </div>
      <span className="sr-only">Loading BETCCO</span>
    </main>
  );
}
