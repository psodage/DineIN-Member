import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bell, Calendar, Clock, RefreshCw, User, Utensils,
} from "lucide-react";
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

/* ── Brand colours ─────────────────────────────────────────────────────── */
const HERO_FROM = "#0f8f88";
const HERO_TO   = "#0b6f69";

/* ── Status badge ───────────────────────────────────────────────────────── */
function StatusBadge({ kind }) {
  const styles = {
    active:   "bg-emerald-100 text-emerald-700",
    done:     "bg-slate-100   text-slate-500",
    upcoming: "bg-orange-100  text-orange-700",
  };
  const labels = { active: "In Progress", done: "Completed", upcoming: "Upcoming" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles[kind] ?? styles.upcoming}`}>
      {labels[kind] ?? "Upcoming"}
    </span>
  );
}

/* ── Meal card ──────────────────────────────────────────────────────────── */
function MealCard({ title, accentColor, timeLabel, menuText, countdown, statusKind }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white p-3 shadow-sm"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div
        className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 rounded-full opacity-10"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accentColor}22` }}
          >
            <Utensils className="h-4 w-4" style={{ color: accentColor }} />
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">{timeLabel}</p>
            <h3 className="text-sm font-extrabold text-ink leading-tight">{title}</h3>
          </div>
        </div>
        <StatusBadge kind={statusKind} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{menuText}</p>
      <div className="mt-2.5 flex items-center gap-1 text-[10px] font-semibold text-muted">
        <Clock className="h-3 w-3 shrink-0" />
        {countdown}
      </div>
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────────────── */
function SectionHeader({ title, action }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-extrabold text-ink">{title}</h2>
      {action}
    </div>
  );
}



/* ── HomeTab ────────────────────────────────────────────────────────────── */
export default function HomeTab({ pollRefreshKey }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const hasUnread = Number(user?.notificationCount ?? 0) > 0;

  const [now, setNow] = useState(() => new Date());
  const [menuList, setMenuList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  const todayKey = toLocalYMD(now);
  const selectedDateKey = toLocalYMD(selectedDate);

  const greeting = useMemo(() => {
    const hrs = now.getHours();
    if (hrs < 12) return "Good Morning";
    if (hrs < 17) return "Good Afternoon";
    return "Good Evening";
  }, [now]);

  const firstName = useMemo(() => {
    return (user?.name || "Member").trim().split(" ")[0];
  }, [user?.name]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await api.get("/api/menu");
      setMenuList(Array.isArray(res?.data) ? res.data : []);
    } catch { setMenuList([]); }
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNow(new Date());
    const d = new Date(); d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    await fetchMenu();
    setRefreshing(false);
  };



  const activeMenu = useMemo(() => resolveMenuFromAtMenu(menuList, selectedDate), [menuList, selectedDate]);
  const lunchText  = resolveMealText(activeMenu?.lunch);
  const dinnerText = resolveMealText(activeMenu?.dinner);
  const isSelectedToday = selectedDateKey === todayKey;

  const lunchWindow = useMemo(() => {
    const d = new Date(selectedDate);
    const s = new Date(d); s.setHours(13, 30, 0, 0);
    const e = new Date(d); e.setHours(14, 30, 0, 0);
    return { start: s, end: e };
  }, [selectedDate]);

  const dinnerWindow = useMemo(() => {
    const d = new Date(selectedDate);
    const s = new Date(d); s.setHours(19, 30, 0, 0);
    const e = new Date(d); e.setHours(20, 30, 0, 0);
    return { start: s, end: e };
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
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      items.push({
        key: toLocalYMD(d), date: d,
        weekdayShort: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayOfMonth: d.getDate(),
      });
    }
    return items;
  }, [todayKey]);

  return (
    <>
      <div className="pb-16">

        {/* ── Top bar — greeting & time header ─────────────────── */}
        <div className="safe-top px-4.5 mt-1.5 pt-7 pb-2">
          <div className="flex items-center justify-between">
            {/* Left side: Greeting + Date & Time */}
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-ink leading-tight tracking-tight">
                {greeting}, {firstName}
              </h1>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted leading-none">
                {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} • {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>

            {/* Right side: Notifications + Profile */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Notification bell */}
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full bg-surface border border-slate-100 transition hover:bg-slate-100 active:scale-95"
              >
                <Bell className="h-4.5 w-4.5 text-slate-600" />
                {hasUnread && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-white" />
                )}
              </button>

              {/* Profile icon */}
              <button
                type="button"
                aria-label="Profile"
                onClick={() => navigate("/dashboard?tab=profile")}
                className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full bg-surface border border-slate-100 transition hover:bg-slate-100 active:scale-95"
              >
                <User className="h-4.5 w-4.5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content sections ─────────────────────────────────── */}
        <div className="mt-3.5 space-y-3 px-3.5">

          {/* Week strip */}
          <div className="rounded-2xl border border-orange-50 bg-surface p-2.5 shadow-sm">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted">This Week</p>
            <div className="grid grid-cols-6 gap-1">
              {weekStrip.map((item) => {
                const isSelected = item.key === selectedDateKey;
                const isToday    = item.key === todayKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!isToday}
                    onClick={() => isToday && setSelectedDate(new Date(item.date))}
                    className={`rounded-lg py-1.5 text-center transition-all ${isSelected
                      ? "bg-accent text-white shadow-md shadow-orange-500/20"
                      : "border border-slate-100 bg-white text-ink"
                    } ${!isToday ? "opacity-40" : "active:scale-95"}`}
                  >
                    <p className="text-[8px] font-bold uppercase tracking-wide opacity-70">{item.weekdayShort}</p>
                    <p className={`mt-0.5 text-xs font-extrabold ${isSelected ? "text-white" : "text-ink"}`}>
                      {item.dayOfMonth}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meal overview */}
          <div className="rounded-2xl border border-orange-50 bg-surface p-3 shadow-sm">
            <SectionHeader
              title="Meal Overview"
              action={
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] font-bold text-accent transition hover:bg-orange-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              }
            />
            <div className="space-y-2">
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

          {/* Today's Poll */}
          <div className="rounded-2xl border border-orange-50 bg-surface p-3 shadow-sm">
            <SectionHeader
              title="Today's Poll"
              action={
                <span className="flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                  <BarChart3 className="h-3 w-3" />
                  Live
                </span>
              }
            />
            <MemberPollCard key={`poll-${pollRefreshKey}`} date={selectedDate} />
          </div>

        </div>
      </div>
    </>
  );
}
