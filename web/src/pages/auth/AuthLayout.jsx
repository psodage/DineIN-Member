/**
 * AuthLayout — shared layout for Login (email & phone) pages.
 * Brand-teal hero with decorative blobs, floating card sheet.
 */
export default function AuthLayout({ children, headline }) {
  return (
    <div className="min-h-dvh bg-surface">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="safe-top relative overflow-hidden bg-brand px-5 pb-20 pt-5">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-8 bottom-4 h-32 w-32 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute right-8 bottom-8 h-16 w-16 rounded-full bg-white/10" />

        {/* Brand bar */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <img src="/logo2.png" alt="DineIN" className="h-7 w-auto" />
          </div>
          <div>
            <p className="text-base font-extrabold text-white">DineIN</p>
            <p className="text-[10px] font-medium text-white/60">Eat Smart. Live Easy.</p>
          </div>
        </div>

        {/* Headline */}
        {headline ? (
          <p className="relative z-10 mt-6 max-w-xs text-xl font-bold leading-snug text-white/90">
            {headline}
          </p>
        ) : null}
      </div>

      {/* ── Floating sheet ─────────────────────────────────────── */}
      <div className="relative z-20 -mt-10 min-h-[66vh] rounded-t-3xl bg-white px-6 pb-10 pt-7 shadow-2xl shadow-slate-900/15">
        {children}
      </div>
    </div>
  );
}
