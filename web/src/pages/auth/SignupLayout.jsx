export default function SignupLayout({ children }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-orange-300 via-accent to-orange-800">
      <div
        className="relative mx-auto min-h-[110px] max-w-lg bg-cover bg-center"
        style={{ backgroundImage: "url(/img4.jpg)" }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 px-5 pb-4 pt-6 safe-top">
          <div className="flex items-center gap-3">
            <img src="/logo2.png" alt="DineIN" className="h-10 w-auto" />
            <div className="h-10 w-px bg-white/90" />
            <div>
              <p className="text-sm font-extrabold text-white">DineIN</p>
              <p className="text-[10px] text-white/90">Eat Smart. Live Easy.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-20 -mt-6 min-h-[91vh] rounded-t-3xl bg-white px-6 pb-8 pt-5 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
