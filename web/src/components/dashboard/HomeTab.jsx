import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Calendar, Clock, LogOut, RefreshCw, Utensils, User } from "lucide-react";
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

/* ── Accent colours matching login/signup page ─────────────────────────── */
const HERO_FROM = "#FB923C"; /* orange-400 */
const HERO_TO = "#9A3412"; /* orange-900 */

/* ── Status badge ───────────────────────────────────────────────────────── */
function StatusBadge({ kind }) {
  const styles = {
    active: "bg-emerald-100 text-emerald-700",
    done: "bg-slate-100   text-slate-500",
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
  const memberName = user?.name || "Member";
  const hasUnread = Number(user?.notificationCount ?? 0) > 0;

  const [now, setNow] = useState(() => new Date());
  const [menuList, setMenuList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
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
  const lunchText = resolveMealText(activeMenu?.lunch);
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

  const handleLogout = async () => { await logout(); navigate("/", { replace: true }); };

  return (
    <div className="pb-32">

      {/* ── Hero header — matches login/signup orange gradient ──── */}
      <header
        className="safe-top relative overflow-hidden px-5 pb-8 pt-5"
        style={{ background: `linear-gradient(135deg, ${HERO_FROM} 0%, ${HERO_TO} 100%)` }}
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-5 bottom-0 h-20 w-20 rounded-full bg-black/10" />
        <div className="pointer-events-none absolute right-10 bottom-10 h-10 w-10 rounded-full bg-white/10" />

        <div className="relative z-10 flex items-center justify-between gap-2.5">
          {/* Logo + greeting */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>

              <p className="text-base font-extrabold leading-tight text-white">{memberName}</p>

            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 transition hover:bg-white/25"
            >
              <Bell className="h-4 w-4 text-white" />
              {hasUnread && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-300 ring-1 ring-orange-600" />
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/20 transition hover:bg-black/30"
            >
              <LogOut className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Floating date-time card ──────────────────────────────── */}
      <div className="-mt-4 mx-4">
        <div className="flex items-center divide-x divide-slate-100 overflow-hidden rounded-xl bg-white shadow-lg shadow-orange-900/10">
          <div className="flex flex-1 items-center gap-2 px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-50">
              <Calendar className="h-3.5 w-3.5 text-accent" />
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">Date</p>
              <p className="text-xs font-bold text-ink leading-tight">
                {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-50">
              <Clock className="h-3.5 w-3.5 text-accent" />
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">Time</p>
              <p className="text-xs font-bold text-ink leading-tight">
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content sections ────────────────────────────────────── */}
      <div className="mt-3.5 space-y-3 px-3.5">

        {/* Week strip */}
        <div className="rounded-2xl border border-orange-50 bg-white p-2.5 shadow-sm">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted">This Week</p>
          <div className="grid grid-cols-6 gap-1">
            {weekStrip.map((item) => {
              const isSelected = item.key === selectedDateKey;
              const isToday = item.key === todayKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={!isToday}
                  onClick={() => isToday && setSelectedDate(new Date(item.date))}
                  className={`rounded-lg py-1.5 text-center transition-all ${isSelected
                    ? "text-white shadow-md shadow-orange-400/40"
                    : "border border-slate-100 bg-slate-50 text-ink"
                    } ${!isToday ? "opacity-40" : "active:scale-95"}`}
                  style={isSelected ? { background: `linear-gradient(135deg, ${HERO_FROM}, ${HERO_TO})` } : {}}
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
        <div className="rounded-2xl border border-orange-50 bg-white p-3 shadow-sm">
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

        {/* Poll */}
        <div className="rounded-2xl border border-orange-50 bg-white p-3 shadow-sm">
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
  );
}
