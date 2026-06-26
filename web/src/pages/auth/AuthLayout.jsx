export default function AuthLayout({ children, headline }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-orange-300 via-accent to-orange-800">
      <div
        className="relative mx-auto min-h-[210px] max-w-lg bg-cover bg-center"
        style={{ backgroundImage: "url(/img4.jpg)" }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 px-5 pb-6">

        </div>
      </div>
      <div className="relative z-20 -mt-10 min-h-[75.6vh] rounded-t-3xl bg-white px-6 pb-8 pt-8 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
