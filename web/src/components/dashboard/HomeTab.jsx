import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Calendar, Clock, LogOut, Utensils, User } from "lucide-react";
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

const PRIMARY = "#0F8F88";

function MealCard({ title, accent, timeLabel, menuText, countdown, statusKind }) {
  const badge =
    statusKind === "active"
      ? "bg-orange-100 text-orange-800"
      : statusKind === "done"
        ? "bg-slate-200 text-slate-700"
        : "bg-orange-50 text-orange-700";

  return (
    <div
      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}22` }}>
            <Utensils className="h-4 w-4" style={{ color: accent }} />
          </div>
          <h3 className="font-extrabold text-ink">{title}</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>
          {statusKind === "active" ? "In Progress" : statusKind === "done" ? "Completed" : "Upcoming"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{menuText}</p>
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">
        <Clock className="h-3.5 w-3.5" />
        {timeLabel} · {countdown}
      </p>
    </div>
  );
}

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
    const start = new Date(d);
    const end = new Date(d);
    start.setHours(13, 30, 0, 0);
    end.setHours(14, 30, 0, 0);
    return { start, end };
  }, [selectedDate]);

  const dinnerWindow = useMemo(() => {
    const d = new Date(selectedDate);
    const start = new Date(d);
    const end = new Date(d);
    start.setHours(19, 30, 0, 0);
    end.setHours(20, 30, 0, 0);
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
    for (let offset = 0; offset < 6; offset += 1) {
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
    <div className="pb-28">
      <header className="relative overflow-hidden rounded-b-[26px] px-5 pb-16 pt-4 safe-top" style={{ backgroundColor: PRIMARY }}>
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-2 border-white/90 bg-white">
              <User className="h-8 w-8 text-brand" />
            </div>
            <div>
              <p className="text-sm text-white/90">Welcome Back,</p>
              <p className="text-xl font-extrabold text-white">{memberName}</p>
              <span className="mt-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                Have a great day!
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg">
              <Bell className="h-5 w-5 text-ink" />
              {hasUnread ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" /> : null}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 shadow-lg"
            >
              <LogOut className="h-5 w-5 text-red-600" />
            </button>
          </div>
        </div>
      </header>

      <div className="-mt-10 mx-4 rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Calendar className="h-4 w-4 text-brand" />
            <p className="text-sm font-bold text-ink">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="h-10 w-px bg-slate-200" />
          <div className="flex items-center gap-2 flex-1">
            <Clock className="h-4 w-4 text-brand" />
            <p className="text-sm font-bold text-ink">
              {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="glass-card p-3">
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
                  className={`rounded-xl py-2 text-center transition ${
                    isSelected ? "bg-brand text-white shadow-lg shadow-brand/30" : "border border-slate-200 bg-white"
                  } ${!isToday ? "opacity-60" : ""}`}
                >
                  <p className="text-[10px] font-semibold">{item.weekdayShort}</p>
                  <p className="text-sm font-extrabold">{item.dayOfMonth}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold text-ink">Meal Overview</h2>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="text-sm font-bold text-brand"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="space-y-3 animate-slide-up">
            <MealCard
              title="Lunch"
              accent="#F59E0B"
              timeLabel="1:30 PM"
              menuText={lunchText}
              countdown={lunchStatus.countdown}
              statusKind={lunchStatus.statusKind}
            />
            <MealCard
              title="Dinner"
              accent="#8B5CF6"
              timeLabel="7:30 PM"
              menuText={dinnerText}
              countdown={dinnerStatus.countdown}
              statusKind={dinnerStatus.statusKind}
            />
          </div>
        </div>

        <div className="glass-card p-4">
          <h2 className="mb-3 font-extrabold text-ink">Poll</h2>
          <MemberPollCard key={`poll-${pollRefreshKey}`} date={selectedDate} />
        </div>
      </div>
    </div>
  );
}
