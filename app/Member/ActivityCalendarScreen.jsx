import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/AuthContext";

// Dummy data shaped like the schemas:
// - LeaveStat (day-wise entries): date, status, leaveType, month, year
// - MemberMonthlyDue: month, year, totalBill, paidAmount, dueAmount, status
const MOCK_LEAVE_STATS = [
  // April 2026
  { date: "2026-04-03", status: "Approved", leaveType: "Sick", month: 3, year: 2026 }, // 3
  { date: "2026-04-04", status: "Approved", leaveType: "Sick", month: 3, year: 2026 }, // 4
  { date: "2026-04-11", status: "Pending", leaveType: "Casual", month: 3, year: 2026 }, // 11
  { date: "2026-04-18", status: "Approved", leaveType: "Casual", month: 3, year: 2026 }, // 18
  { date: "2026-04-27", status: "Pending", leaveType: "Emergency", month: 3, year: 2026 }, // 27

  // March 2026
  { date: "2026-03-02", status: "Approved", leaveType: "Sick", month: 2, year: 2026 },
  { date: "2026-03-05", status: "Approved", leaveType: "Casual", month: 2, year: 2026 },
  { date: "2026-03-19", status: "Pending", leaveType: "Sick", month: 2, year: 2026 },

  // February 2026
  { date: "2026-02-07", status: "Approved", leaveType: "Casual", month: 1, year: 2026 },
  { date: "2026-02-08", status: "Approved", leaveType: "Casual", month: 1, year: 2026 },
  { date: "2026-02-21", status: "Pending", leaveType: "Emergency", month: 1, year: 2026 },
];

const MOCK_MEMBER_MONTHLY_DUE = [
  // February
  {
    month: 1,
    year: 2026,
    totalBill: 8200,
    paidAmount: 4100,
    dueAmount: 4100,
    status: "Partial",
  },
  // March
  {
    month: 2,
    year: 2026,
    totalBill: 9200,
    paidAmount: 9200,
    dueAmount: 0,
    status: "Paid",
  },
  // April
  {
    month: 3,
    year: 2026,
    totalBill: 12500,
    paidAmount: 3500,
    dueAmount: 9000,
    status: "Partial",
  },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatSelectedDateFull(d) {
  const weekday = WEEKDAYS_FULL[d.getDay()];
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getMonthTitle(year, monthIndex) {
  return `${MONTHS[monthIndex]} ${year}`;
}

// Monday-first calendar grid (42 cells).
function buildMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = getDaysInMonth(year, monthIndex);

  // JS: Sunday=0..Saturday=6. Convert so Monday=0..Sunday=6.
  const mondayIndex = (first.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const dayNumber = i - mondayIndex + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push(null);
      continue;
    }
    cells.push(new Date(year, monthIndex, dayNumber));
  }
  return cells;
}

function shiftMonth(selectedDate, delta) {
  const day = selectedDate.getDate();
  const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
  const days = getDaysInMonth(next.getFullYear(), next.getMonth());
  const clampedDay = Math.min(day, days);
  return new Date(next.getFullYear(), next.getMonth(), clampedDay);
}

function getMonthlyLeaveSummary(monthIndex, year) {
  const monthItems = MOCK_LEAVE_STATS.filter(
    (r) => r.month === monthIndex && r.year === year
  );

  const total = monthItems.length;
  const approved = monthItems.filter((r) => r.status === "Approved").length;
  const pending = monthItems.filter((r) => r.status === "Pending").length;

  if (!total) return null;
  return { total, approved, pending };
}

function getMonthlyBillSummary(monthIndex, year) {
  const item = MOCK_MEMBER_MONTHLY_DUE.find(
    (b) => b.month === monthIndex && b.year === year
  );
  if (!item) return null;

  const total = item.totalBill ?? 0;
  const paid = item.paidAmount ?? 0;
  const due = item.dueAmount ?? Math.max(total - paid, 0);

  let status = item.status;
  if (!status) {
    if (!due || due <= 0) status = "Paid";
    else if (paid > 0) status = "Partial";
    else status = "Unpaid";
  }

  return { total, paid, due, status };
}

function getBadgeColors(status) {
  if (status === "Paid") {
    return { bg: "#ECFDF5", fg: "#047857", border: "#10B981" };
  }
  if (status === "Partial") {
    return { bg: "#FFF7ED", fg: "#9A3412", border: "#F97316" };
  }
  return { bg: "#FEF2F2", fg: "#991B1B", border: "#EF4444" };
}

export default function ActivityCalendarScreen({ embedded = false }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const memberName = user?.name || "Member";
  const restaurantLogoSource = require("../../assets/images/logo2.png");

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIndex = selectedDate.getMonth();

  // Safety clamp in case selected day-of-month doesn't exist in the month.
  useEffect(() => {
    const days = getDaysInMonth(selectedYear, selectedMonthIndex);
    if (selectedDate.getDate() <= days) return;
    setSelectedDate(
      new Date(selectedYear, selectedMonthIndex, Math.max(1, days))
    );
  }, [selectedDate, selectedYear, selectedMonthIndex]);

  const cells = useMemo(
    () => buildMonthCells(selectedYear, selectedMonthIndex),
    [selectedYear, selectedMonthIndex]
  );

  const monthTitle = useMemo(
    () => getMonthTitle(selectedYear, selectedMonthIndex),
    [selectedYear, selectedMonthIndex]
  );

  const selectedDateKey = useMemo(() => formatYMD(selectedDate), [selectedDate]);
  const leaveSummary = useMemo(
    () => getMonthlyLeaveSummary(selectedMonthIndex, selectedYear),
    [selectedMonthIndex, selectedYear]
  );
  const billSummary = useMemo(
    () => getMonthlyBillSummary(selectedMonthIndex, selectedYear),
    [selectedMonthIndex, selectedYear]
  );

  const dotMap = useMemo(() => {
    // Calendar dots:
    // - Approved leave days: green dot
    // - Pending leave days: amber dot
    // - Extra sample due dot: blue on ~25th
    const map = new Map(); // ymd -> [colors]

    const addDot = (ymd, color) => {
      const prev = map.get(ymd) || [];
      if (prev.length >= 3) return;
      map.set(ymd, [...prev, color]);
    };

    for (const r of MOCK_LEAVE_STATS) {
      if (r.month !== selectedMonthIndex || r.year !== selectedYear) continue;
      const color = r.status === "Approved" ? "#10B981" : "#F59E0B";
      addDot(r.date, color);
    }

    // Sample due indicator dot on 25th.
    const dueDay = 25;
    const dueDate = new Date(selectedYear, selectedMonthIndex, dueDay);
    if (!Number.isNaN(dueDate.getTime())) addDot(formatYMD(dueDate), "#3B82F6");

    return map;
  }, [selectedMonthIndex, selectedYear]);

  const renderWeekdayRow = () => {
    return (
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
    );
  };

  const renderCalendarGrid = () => {
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }

    return (
      <View style={{ width: "100%" }}>
        {rows.map((week, weekIdx) => (
          <View key={`w-${weekIdx}`} style={styles.weekRow}>
            {week.map((d, idx) => {
              if (!d) {
                return <View key={`e-${weekIdx}-${idx}`} style={styles.dayCellEmpty} />;
              }

              const ymd = formatYMD(d);
              const isSelected = ymd === selectedDateKey;
              const dots = dotMap.get(ymd) || [];

              return (
                <TouchableOpacity
                  key={ymd}
                  activeOpacity={0.9}
                  onPress={() => setSelectedDate(d)}
                  style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                >
                  <View style={styles.dayInner}>
                    <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                      {d.getDate()}
                    </Text>

                    {!!dots.length && (
                      <View style={styles.dotsWrap}>
                        {dots.map((color, dotIdx) => (
                          <View
                            key={`${ymd}-${dotIdx}`}
                            style={[styles.dot, { backgroundColor: color }]}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const leaveCard = () => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Monthly Leave Days</Text>
          <View style={styles.cardHeaderLine} />
        </View>

        {!leaveSummary ? (
          <Text style={styles.noDataText}>No leave records for this month</Text>
        ) : (
          <>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total Leave Days</Text>
              <Text style={styles.statValue}>{leaveSummary.total}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Approved Leaves</Text>
              <Text style={styles.statValueApproved}>{leaveSummary.approved}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Pending Leaves</Text>
              <Text style={styles.statValuePending}>{leaveSummary.pending}</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const billCard = () => {
    const badge = billSummary ? getBadgeColors(billSummary.status) : null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Monthly Bill</Text>
          <View style={styles.cardHeaderLine} />
        </View>

        {!billSummary ? (
          <Text style={styles.noDataText}>No bill generated for this month</Text>
        ) : (
          <>
            <View style={styles.billTopRow}>
              <View style={[styles.badge, badge && { backgroundColor: badge.bg, borderColor: badge.border }]}>
                <Text style={[styles.badgeText, badge && { color: badge.fg }]}>
                  {billSummary.status}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total Monthly Bill</Text>
              <Text style={styles.statValue}>₹{Math.round(billSummary.total).toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Paid Amount</Text>
              <Text style={styles.statValueApproved}>₹{Math.round(billSummary.paid).toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Remaining Due</Text>
              <Text style={styles.statValuePending}>₹{Math.round(billSummary.due).toLocaleString("en-IN")}</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const onPrevMonth = () => setSelectedDate((d) => shiftMonth(d, -1));
  const onNextMonth = () => setSelectedDate((d) => shiftMonth(d, 1));

  const [activeTab, setActiveTab] = useState("leaves");
  const tabScaleRef = useRef({
    home: new Animated.Value(1),
    snacks: new Animated.Value(1),
    leaves: new Animated.Value(1),
    bill: new Animated.Value(1),
    profile: new Animated.Value(1),
  });

  const getTabScaleValue = (key) => {
    if (!tabScaleRef.current[key]) {
      tabScaleRef.current[key] = new Animated.Value(1);
    }
    return tabScaleRef.current[key];
  };

  const TopHeader = () => {
    return (
      <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topHeaderInner}>
          <View style={styles.topHeaderLeft}>
            <View style={styles.restaurantAvatar}>
              <Image
                source={restaurantLogoSource}
                style={styles.restaurantAvatarImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.topHeaderDivider} />

            <View style={styles.topHeaderTextBlock}>
              <Text style={styles.topHeaderGreeting}>Welcome Back!</Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.topHeaderTitle}
              >
                {memberName}
              </Text>
            </View>
          </View>

          <View style={styles.topHeaderIconsRow}>
            <TouchableOpacity
              style={styles.topHeaderNotifBtn}
              activeOpacity={0.85}
              onPress={() => {
                setActiveTab("home");
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color="#1F2937"
              />
              <View style={styles.topHeaderNotifDot} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topHeaderNotifBtn}
              activeOpacity={0.85}
              onPress={async () => {
                try {
                  await logout?.();
                } finally {
                  router.replace("/");
                }
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const BottomNav = () => {
    const primary = "#F97316";
    const inactive = "#9CA3AF";

    const animatePress = (key) => {
      const v = getTabScaleValue(key);
      if (!v) return;
      Animated.spring(v, {
        toValue: 0.94,
        useNativeDriver: true,
        speed: 30,
        bounciness: 6,
      }).start(() => {
        Animated.spring(v, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
          bounciness: 6,
        }).start();
      });
    };

    const goTo = (key) => {
      setActiveTab(key);
      animatePress(key);

      if (key === "snacks") router.push("/Member/SnackOrderPage");
      if (key === "leaves") router.push("/Member/ActivityCalendarScreen");
      if (key === "profile") router.push("/Member/MemberProfile");
    };

    const item = (key, label, icon) => {
      const isActive = activeTab === key;
      const color = isActive ? primary : inactive;
      const size = isActive ? 26 : 22;
      return (
        <TouchableOpacity
          key={key}
          style={styles.bottomNavItem}
          activeOpacity={0.9}
          onPress={() => goTo(key)}
        >
          <View style={styles.bottomNavItemInner}>
            {isActive && (
              <View
                style={[styles.bottomNavIndicator, { backgroundColor: primary }]}
              />
            )}
            <Animated.View
              style={{ transform: [{ scale: getTabScaleValue(key) }] }}
            >
              <Ionicons name={icon} size={size} color={color} />
            </Animated.View>
            <Text style={[styles.bottomNavLabel, { color }]}>{label}</Text>
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {item("snacks", "Extra Snacks", "fast-food-outline")}
        {item("leaves", "Leaves", "calendar-outline")}
        {item("home", "Home", "home-outline")}
        {item("bill", "Bill", "receipt-outline")}
        {item("profile", "Profile", "person-outline")}
      </View>
    );
  };

  const content = (
    <ScrollView
      style={embedded ? styles.embeddedBodyScroll : styles.bodyScroll}
      contentContainerStyle={embedded ? styles.embeddedBodyContent : styles.bodyContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.calendarShell}>
        <View style={styles.monthHeaderRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPrevMonth}
            style={styles.monthNavBtn}
          >
            <Ionicons name="chevron-back" size={20} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>{monthTitle}</Text>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onNextMonth}
            style={styles.monthNavBtn}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color="#111827"
            />
          </TouchableOpacity>
        </View>

        {renderWeekdayRow()}

        <View style={{ marginTop: 10 }}>{renderCalendarGrid()}</View>
      </View>

      <View style={styles.selectedDateBar}>
        <Text style={styles.selectedDateText}>
          {formatSelectedDateFull(selectedDate)}
        </Text>
      </View>

      <View style={styles.cardsWrap}>
        {leaveCard()}
        {billCard()}
      </View>
    </ScrollView>
  );

  if (embedded) {
    return content;
  }

  return (
    <View style={styles.container}>
      <TopHeader />
      {content}

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  embeddedBodyScroll: {
    flex: 1,
  },
  embeddedBodyContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 24,
  },
  page: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  pageInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  calendarShell: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  monthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  monthNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  weekdayRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
    color: "#6B7280",
  },
  weekRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  dayCellEmpty: {
    flex: 1,
    height: 44,
  },
  dayCell: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  dayCellSelected: {
    backgroundColor: "rgba(17, 24, 39, 0.06)",
    borderWidth: 1,
    borderColor: "#111827",
  },
  dayInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 3,
  },
  dayNumberSelected: {
    color: "#111827",
  },
  dotsWrap: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  selectedDateBar: {
    marginTop: 14,
    backgroundColor: "#0B1220",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectedDateText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  cardsWrap: {
    marginTop: 14,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  cardHeaderLine: {
    marginTop: 8,
    height: 1,
    width: "100%",
    backgroundColor: "#F3F4F6",
  },
  noDataText: {
    marginTop: 8,
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "800",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  statLabel: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "800",
  },
  statValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
  },
  statValueApproved: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "900",
  },
  statValuePending: {
    color: "#9A3412",
    fontSize: 13,
    fontWeight: "900",
  },
  billTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  topHeader: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topHeaderInner: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  restaurantAvatar: {
    width: 52,
    height: 32,
  },
  restaurantAvatarImage: {
    width: "100%",
    height: "100%",
  },
  topHeaderDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 12,
  },
  topHeaderTextBlock: {
    justifyContent: "center",
  },
  topHeaderGreeting: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 2,
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1F2937",
  },
  topHeaderNotifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topHeaderIconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topHeaderNotifDot: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    height: 72,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavItemInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavIndicator: {
    width: 22,
    height: 4,
    borderRadius: 999,
    marginBottom: 6,
  },
  bottomNavLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
  },
});

