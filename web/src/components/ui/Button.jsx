const variants = {
  primary: "bg-brand text-white shadow-lg shadow-brand/25 hover:bg-brand-dark",
  accent: "bg-accent text-white shadow-lg shadow-accent/25 hover:bg-orange-600",
  ghost: "bg-transparent text-brand hover:bg-brand/10",
  danger: "bg-red-50 text-red-600 hover:bg-red-100",
  outline: "border border-slate-200 bg-white text-ink hover:bg-slate-50",
};

export default function Button({
  children,
  variant = "primary",
  className = "",
  loading = false,
  disabled,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : null}
      {children}
    </button>
  );
}
