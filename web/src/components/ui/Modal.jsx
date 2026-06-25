export default function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/45 p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? <h3 className="text-base font-extrabold text-ink">{title}</h3> : null}
        <div className="mt-2 text-sm font-medium leading-relaxed text-muted">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          {actions ?? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
