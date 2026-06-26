import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Receipt } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { formatCurrencyINR, monthKeyLocal } from "../../lib/dateUtils";
import LoadingOverlay from "../../components/ui/LoadingOverlay";

function formatMonthLabel(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function BillTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const memberId = user?.id || user?._id;

  const [loading, setLoading] = useState(true);
  const [monthSummary, setMonthSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!memberId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [currentRes, payRes, histRes] = await Promise.all([
          api.get(`/api/member-monthly-due/${memberId}/current`),
          api.get(`/api/payments/${memberId}`),
          api.get(`/api/member-monthly-due/${memberId}/history?all=true`),
        ]);
        if (!cancelled) {
          setMonthSummary(currentRes?.data || null);
          setPayments(Array.isArray(payRes?.data) ? payRes.data : []);
          setHistory(Array.isArray(histRes?.data) ? histRes.data : []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const premium = useMemo(() => {
    const total = Number(monthSummary?.totalBill || 0);
    const paid = Number(monthSummary?.paidAmount || 0);
    const due = Math.max(0, total - paid);
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    return { total, paid, due, pct };
  }, [monthSummary]);

  if (loading) return <LoadingOverlay visible />;

  return (
    <div className="min-h-dvh bg-white pb-16">
      <header className="safe-top rounded-b-[26px] bg-brand px-5 pb-8 pt-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">My Bill</h1>
            <p className="text-sm text-white/85">
              {monthSummary?.month ? formatMonthLabel(monthSummary.month) : "Current month"}
            </p>
          </div>
          <Receipt className="h-10 w-10 text-white/20" />
        </div>
      </header>

      <div className="space-y-4 px-4 -mt-6">
        <div className="rounded-2xl border border-slate-100 bg-surface p-5 animate-slide-up">
          <p className="text-sm font-semibold text-muted">Total bill</p>
          <p className="mt-1 text-3xl font-extrabold text-ink">{formatCurrencyINR(premium.total)}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${premium.pct}%` }} />
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="font-semibold text-green-700">Paid {formatCurrencyINR(premium.paid)}</span>
            <span className="font-semibold text-red-600">Due {formatCurrencyINR(premium.due)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            ["Meals", monthSummary?.mealAmount],
            ["Snacks", monthSummary?.snacksAmount],
            ["Expenses", monthSummary?.expenseShare],
            ["Leave adj.", monthSummary?.leaveDeduction],
          ].map(([label, val]) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-surface p-3">
              <p className="text-xs font-semibold text-muted">{label}</p>
              <p className="mt-1 font-extrabold text-ink">{formatCurrencyINR(val)}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate("/bill/payments")}
          className="flex w-full items-center justify-between rounded-2xl bg-surface p-4 shadow-sm"
        >
          <span className="font-bold text-ink">Payment history</span>
          <ChevronRight className="h-5 w-5 text-muted" />
        </button>

        {history.length > 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-surface p-4">
            <h2 className="mb-3 font-extrabold text-ink">Past months</h2>
            <ul className="space-y-2">
              {history.slice(0, 6).map((row) => (
                <li
                  key={monthKeyLocal(row?.month) || row?._id}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{formatMonthLabel(row?.month)}</span>
                  <span className="font-bold text-ink">{formatCurrencyINR(row?.due ?? row?.totalBill)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {payments.length > 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-surface p-4">
            <h2 className="mb-3 font-extrabold text-ink">Recent payments</h2>
            <ul className="space-y-2">
              {payments.slice(0, 4).map((p) => (
                <li key={p._id} className="flex justify-between text-sm">
                  <span>{new Date(p.date || p.createdAt).toLocaleDateString()}</span>
                  <span className="font-bold text-green-700">{formatCurrencyINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
