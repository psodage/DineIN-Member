import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, History } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { monthKeyLocal, toLocalYMD } from "../../lib/dateUtils";
import Button from "../../components/ui/Button";
import LoadingOverlay from "../../components/ui/LoadingOverlay";
import Modal from "../../components/ui/Modal";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const total = new Date(year, monthIndex + 1, 0).getDate();
  const mondayStart = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = i - mondayStart + 1;
    cells.push(day > 0 && day <= total ? day : null);
  }
  return cells;
}

export default function LeaveTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const memberId = user?.id || user?._id;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [leaveDates, setLeaveDates] = useState(new Set());
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);

  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  const loadMonthData = useCallback(async () => {
    if (!memberId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [leaveRes] = await Promise.all([
        api.get(`/api/leave/self/${memberId}/month?month=${monthKey}`),
      ]);
      const dates = new Set();
      const requests = Array.isArray(leaveRes?.data?.requests) ? leaveRes.data.requests : [];
      requests.forEach((r) => {
        if (r?.date) dates.add(toLocalYMD(r.date));
        if (r?.startDate) dates.add(toLocalYMD(r.startDate));
      });
      setLeaveDates(dates);
      setStats({
        pending: requests.filter((r) => r.status === "pending").length,
        approved: requests.filter((r) => r.status === "approved").length,
        rejected: requests.filter((r) => r.status === "rejected").length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [memberId, monthKey]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  const cells = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);

  const submitLeave = async () => {
    if (!memberId) return;
    const todayYmd = toLocalYMD(new Date());
    try {
      setSubmitting(true);
      await api.post("/api/leave/apply", {
        memberId,
        startDate: todayYmd,
        endDate: todayYmd,
        type: "Leave",
      });
      setConfirmOpen(false);
      setModal({ title: "Success", body: "Leave request submitted for today." });
      await loadMonthData();
    } catch (err) {
      setModal({ title: "Error", body: err?.response?.data?.message || "Failed to submit leave." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingOverlay visible />;

  return (
    <div className="min-h-dvh bg-white pb-16">
      <header className="safe-top rounded-b-[26px] bg-brand px-5 pb-8 pt-4 text-white">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate("/leaves/history")}
            className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold"
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold">My Leaves</h1>
        <p className="text-sm text-white/85">Manage your leave days easily</p>
      </header>

      <div className="space-y-4 px-4 -mt-4">
        <div className="rounded-2xl border border-slate-100 bg-surface grid grid-cols-3 gap-2 p-4 text-center text-sm">
          <div>
            <p className="text-muted">Pending</p>
            <p className="font-extrabold text-ink">{stats.pending}</p>
          </div>
          <div>
            <p className="text-muted">Approved</p>
            <p className="font-extrabold text-green-700">{stats.approved}</p>
          </div>
          <div>
            <p className="text-muted">Rejected</p>
            <p className="font-extrabold text-red-600">{stats.rejected}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="text-brand font-bold"
              onClick={() => {
                const d = new Date(year, monthIndex - 1, 1);
                setYear(d.getFullYear());
                setMonthIndex(d.getMonth());
              }}
            >
              ‹
            </button>
            <p className="font-extrabold text-ink">
              {new Date(year, monthIndex, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              className="text-brand font-bold"
              onClick={() => {
                const d = new Date(year, monthIndex + 1, 1);
                setYear(d.getFullYear());
                setMonthIndex(d.getMonth());
              }}
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const ymd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const onLeave = leaveDates.has(ymd);
              return (
                <div
                  key={ymd}
                    className={`flex h-9 items-center justify-center rounded-lg text-sm font-bold ${
                      onLeave ? "bg-red-100 text-red-700" : "bg-white text-slate-700"
                    }`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>

        <Button className="w-full" onClick={() => setConfirmOpen(true)}>
          <Calendar className="h-5 w-5" />
          Apply leave for today
        </Button>
      </div>

      <Modal open={confirmOpen} title="Confirm leave" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4">Submit a leave request for today?</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submitLeave}>
            Confirm
          </Button>
        </div>
      </Modal>

      <Modal open={!!modal} title={modal?.title} onClose={() => setModal(null)}>
        {modal?.body}
      </Modal>
    </div>
  );
}
