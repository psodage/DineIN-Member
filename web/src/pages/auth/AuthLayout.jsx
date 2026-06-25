export default function AuthLayout({ children, headline }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-orange-300 via-accent to-orange-800">
      <div
        className="relative mx-auto min-h-[280px] max-w-lg bg-cover bg-center"
        style={{ backgroundImage: "url(/img4.jpg)" }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 px-5 pb-6 pt-10 safe-top">
          <div className="flex items-center gap-3">
            <img src="/logo2.png" alt="DineIN" className="h-10 w-auto" />
            <div className="h-10 w-px bg-white/90" />
            <div>
              <p className="text-sm font-extrabold text-white">DineIN</p>
              <p className="text-[10px] text-white/90">Eat Smart. Live Easy.</p>
            </div>
          </div>
          {headline ? (
            <p className="mt-8 max-w-xs text-2xl font-bold leading-snug text-white drop-shadow">
              {headline}
            </p>
          ) : null}
        </div>
      </div>
      <div className="relative z-20 -mt-10 min-h-[66vh] rounded-t-3xl bg-white px-6 pb-8 pt-8 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
