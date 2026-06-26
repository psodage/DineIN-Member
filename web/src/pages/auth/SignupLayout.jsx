export default function SignupLayout({ children }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-orange-300 via-accent to-orange-800">
      <div
        className="relative mx-auto min-h-[140px] max-w-lg bg-cover bg-center"
        style={{ backgroundImage: "url(/img4.jpg)" }}
      >
        <div className="absolute inset-0 bg-black/30" />

      </div>
      <div className="relative z-20 -mt-8 min-h-[73vh] rounded-t-3xl bg-white px-6 pb-8 pt-5 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
