import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Calendar, CheckCircle2, Clock, LogOut, RefreshCw, Utensils, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { toLocalYMD } from "../../lib/dateUtils";
import MemberPollCard from "./MemberPollCard";
import {
  formatDurationLabel,
  resolveMealText,
  resolveMenuFromAtMenu,
} from "./menuUtils";

/* ─── Meal status badge ─────────────────────────────────────────────────── */
function StatusBadge({ kind }) {
  const map = {
    active: "bg-emerald-100 text-emerald-700",
    done: "bg-slate-100 text-slate-500",
    upcoming: "bg-orange-100 text-orange-700",
  };
  const label = { active: "In Progress", done: "Completed", upcoming: "Upcoming" };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${map[kind] ?? map.upcoming}`}>
      {label[kind] ?? "Upcoming"}
    </span>
  );
}

/* ─── Meal card ─────────────────────────────────────────────────────────── */
function MealCard({ title, accentColor, timeLabel, menuText, countdown, statusKind }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm"
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      {/* faint tinted background circle */}
      <div
        className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-10"
        style={{ backgroundColor: accentColor }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accentColor}22` }}
          >
            <Utensils className="h-4.5 w-4.5" style={{ color: accentColor }} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{timeLabel}</p>
            <h3 className="font-extrabold text-ink">{title}</h3>
          </div>
        </div>
        <StatusBadge kind={statusKind} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">{menuText}</p>

      <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {countdown}
      </div>
    </div>
  );
}

/* ─── Section header ────────────────────────────────────────────────────── */
function SectionHeader({ title, action }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/* ─── HomeTab ───────────────────────────────────────────────────────────── */
export default function HomeTab({ pollRefreshKey }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const memberId = user?.id || user?._id;
  const memberName = user?.name || "Member";
  const hasUnread = Number(user?.notificationCount ?? 0) > 0;

  const [now, setNow] = useState(() => new Date());
  const [menuList, setMenuList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const todayKey = toLocalYMD(now);
  const selectedDateKey = toLocalYMD(selectedDate);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await api.get("/api/menu");
      setMenuList(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setMenuList([]);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNow(new Date());
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    await fetchMenu();
    setRefreshing(false);
  };

  const activeMenu = useMemo(
    () => resolveMenuFromAtMenu(menuList, selectedDate),
    [menuList, selectedDate]
  );

  const lunchText = resolveMealText(activeMenu?.lunch);
  const dinnerText = resolveMealText(activeMenu?.dinner);
  const isSelectedToday = selectedDateKey === todayKey;

  const lunchWindow = useMemo(() => {
    const d = new Date(selectedDate);
    const start = new Date(d); start.setHours(13, 30, 0, 0);
    const end = new Date(d);   end.setHours(14, 30, 0, 0);
    return { start, end };
  }, [selectedDate]);

  const dinnerWindow = useMemo(() => {
    const d = new Date(selectedDate);
    const start = new Date(d); start.setHours(19, 30, 0, 0);
    const end = new Date(d);   end.setHours(20, 30, 0, 0);
    return { start, end };
  }, [selectedDate]);

  const lunchStatus = useMemo(() => {
    if (!isSelectedToday) return { countdown: "Starts at 1:30 PM", statusKind: "upcoming" };
    if (now >= lunchWindow.start && now < lunchWindow.end) return { countdown: "In progress", statusKind: "active" };
    if (now >= lunchWindow.end) return { countdown: "Completed", statusKind: "done" };
    return { countdown: formatDurationLabel(lunchWindow.start - now), statusKind: "upcoming" };
  }, [isSelectedToday, now, lunchWindow]);

  const dinnerStatus = useMemo(() => {
    if (!isSelectedToday) return { countdown: "Starts at 7:30 PM", statusKind: "upcoming" };
    if (now >= dinnerWindow.start && now < dinnerWindow.end) return { countdown: "In progress", statusKind: "active" };
    if (now >= dinnerWindow.end) return { countdown: "Completed", statusKind: "done" };
    return { countdown: formatDurationLabel(dinnerWindow.start - now), statusKind: "upcoming" };
  }, [isSelectedToday, now, dinnerWindow]);

  const weekStrip = useMemo(() => {
    const items = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let offset = 0; offset < 6; offset++) {
      const d = new Date(start);
      d.setDate(start.getDate() + offset);
      items.push({
        key: toLocalYMD(d),
        date: d,
        weekdayShort: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayOfMonth: d.getDate(),
      });
    }
    return items;
  }, [todayKey]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="pb-32">

      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <header className="safe-top relative overflow-hidden bg-brand px-5 pb-20 pt-5">
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-white/5" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          {/* Avatar + greeting */}
          <div className="flex items-center gap-3">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border-2 border-white/30 bg-white/20">
              <User className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white/70">Welcome back 👋</p>
              <p className="text-lg font-extrabold leading-tight text-white">{memberName}</p>
              <span className="mt-1 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/90">
                Have a great day!
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 transition hover:bg-white/25"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-white" />
              {hasUnread ? (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-400 ring-2 ring-brand" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/80 transition hover:bg-red-500"
              aria-label="Log out"
            >
              <LogOut className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Floating date-time pill ───────────────────────────────────── */}
      <div className="-mt-8 mx-4">
        <div className="flex items-center divide-x divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/10">
          <div className="flex flex-1 items-center gap-2.5 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
              <Calendar className="h-4 w-4 text-brand" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Date</p>
              <p className="text-sm font-bold text-ink">
                {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2.5 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50">
              <Clock className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Time</p>
              <p className="text-sm font-bold text-ink">
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="mt-4 space-y-4 px-4">

        {/* Week strip */}
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">This Week</p>
          <div className="grid grid-cols-6 gap-1.5">
            {weekStrip.map((item) => {
              const isSelected = item.key === selectedDateKey;
              const isToday = item.key === todayKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={!isToday}
                  onClick={() => isToday && setSelectedDate(new Date(item.date))}
                  className={`rounded-xl py-2.5 text-center transition-all ${
                    isSelected
                      ? "bg-brand text-white shadow-md shadow-brand/30"
                      : "border border-slate-100 bg-slate-50 text-ink"
                  } ${!isToday ? "opacity-40" : "active:scale-95"}`}
                >
                  <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{item.weekdayShort}</p>
                  <p className={`mt-0.5 text-sm font-extrabold ${isSelected ? "text-white" : "text-ink"}`}>
                    {item.dayOfMonth}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Meal overview */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <SectionHeader
            title="Meal Overview"
            action={
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-brand transition hover:bg-brand/10 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            }
          />
          <div className="space-y-3">
            <MealCard
              title="Lunch"
              accentColor="#F59E0B"
              timeLabel="1:30 PM"
              menuText={lunchText}
              countdown={lunchStatus.countdown}
              statusKind={lunchStatus.statusKind}
            />
            <MealCard
              title="Dinner"
              accentColor="#8B5CF6"
              timeLabel="7:30 PM"
              menuText={dinnerText}
              countdown={dinnerStatus.countdown}
              statusKind={dinnerStatus.statusKind}
            />
          </div>
        </div>

        {/* Poll */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <SectionHeader
            title="Today's Poll"
            action={
              <div className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">
                <BarChart3 className="h-3.5 w-3.5" />
                Live
              </div>
            }
          />
          <MemberPollCard key={`poll-${pollRefreshKey}`} date={selectedDate} />
        </div>
      </div>
    </div>
  );
}
