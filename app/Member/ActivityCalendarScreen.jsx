import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";

const PRIMARY = "#0F8F88";
const BG = "#F5F7FA";
const TEXT_DARK = "#0F172A";
const TEXT_MUTE = "#64748B";
const GREEN_BG = "#DDF5E8";
const GREEN_TEXT = "#188A5A";
const RED_BG = "#FCE8EA";
const RED_TEXT = "#BE3845";
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
const MONTHLY_LEAVE_ALLOWANCE = 20;

function monthKeyLocal(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function extractDayFromKey(dayKey) {
  if (!dayKey) return null;
  const s = String(dayKey).trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Number(match[3]);
}

function formatDateLabel(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  try {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const total = daysInMonth(year, monthIndex);
  const mondayStart = (first.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const day = i - mondayStart + 1;
    cells.push(day > 0 && day <= total ? day : null);
  }
  return cells;
}

function toMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function normalizedBillStatus({ dueAmount, paidAmount, monthlyStatus }) {
  const due = Number(dueAmount || 0);
  const paid = Number(paidAmount || 0);
  if (due <= 0) return "Paid";
  if (paid > 0) return "Partial";
  const status = String(monthlyStatus || "").trim();
  return status || "Pending";
}

export default function ActivityCalendarScreen({ embedded = false }) {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState("leaves");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [memberDetails, setMemberDetails] = useState(null);
  const [monthLeaveSummary, setMonthLeaveSummary] = useState(null);
  const [billSummary, setBillSummary] = useState(null);
  const [leaveDates, setLeaveDates] = useState(new Set());
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyStartDate, setApplyStartDate] = useState("");
  const [applyEndDate, setApplyEndDate] = useState("");
  const [applyReason, setApplyReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const tabScaleRef = useRef({
    home: new Animated.Value(1),
    snacks: new Animated.Value(1),
    leaves: new Animated.Value(1),
    bill: new Animated.Value(1),
    profile: new Animated.Value(1),
  });

  const year = selectedMonth.getFullYear();
  const monthIndex = selectedMonth.getMonth();
  const selectedDay = selectedDate.getFullYear() === year && selectedDate.getMonth() === monthIndex
    ? selectedDate.getDate()
    : null;
  const monthTitle = `${MONTHS[monthIndex]} ${year}`;
  const calendarData = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);
  const memberId = user?.id || user?._id;
  const monthKey = useMemo(() => toMonthKey(year, monthIndex), [year, monthIndex]);

  const loadMonthData = useCallback(
    async (isRefresh = false) => {
      if (!memberId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [memberRes, billRes, leaveRes] = await Promise.all([
          api.get(`/api/members/${memberId}`),
          api.get(`/api/member-monthly-due/${memberId}?month=${monthKey}`),
          api.get(`/api/leave/self/${memberId}/month?month=${monthKey}`),
        ]);

        setMemberDetails(memberRes?.data || null);
        setBillSummary(billRes?.data || null);
        setMonthLeaveSummary(leaveRes?.data || null);

        const leaveKeys = Array.isArray(leaveRes?.data?.approvedLeaveDates)
          ? leaveRes.data.approvedLeaveDates
          : [];
        setLeaveDates(
          new Set(
            leaveKeys
              .map((key) => extractDayFromKey(key))
              .filter((day) => Number.isInteger(day) && day > 0)
          )
        );
      } catch (error) {
        console.error("Leaves month fetch error:", error);
        if (!isRefresh) {
          setMemberDetails(null);
          setBillSummary(null);
          setMonthLeaveSummary(null);
          setLeaveDates(new Set());
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [memberId, monthKey]
  );

  useEffect(() => {
    loadMonthData(false);
  }, [loadMonthData]);

  const leaveTakenDays = leaveDates;
  const inactiveDaysCount = Number(monthLeaveSummary?.approvedLeaveCount || 0) || leaveTakenDays.size;
  const monthlyAllowance = MONTHLY_LEAVE_ALLOWANCE;
  const leavesAvailableCount = Math.max(0, monthlyAllowance - inactiveDaysCount);
  const totalBill = Number(billSummary?.totalBill || 0);
  const paidAmount = Number(billSummary?.paidAmount || 0);
  const dueAmount = Number(billSummary?.remainingAmount ?? billSummary?.monthlyDue ?? 0);
  const monthlyStatus = normalizedBillStatus({
    dueAmount,
    paidAmount,
    monthlyStatus: billSummary?.monthlyStatus,
  });
  const nextResetDate = new Date(year, monthIndex + 1, 1);
  const billSummaryText = `Total ₹${totalBill.toLocaleString("en-IN")} • Paid ₹${paidAmount.toLocaleString("en-IN")} • Due ₹${Math.max(0, dueAmount).toLocaleString("en-IN")}`;

  const onChangeMonth = (delta) => {
    setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const onPickDay = (day) => {
    if (!day) return;
    setSelectedDate(new Date(year, monthIndex, day));
  };

  const getScale = (key) => tabScaleRef.current[key] || new Animated.Value(1);
  const animateTab = (key) => {
    const v = getScale(key);
    Animated.sequence([
      Animated.spring(v, { toValue: 0.94, useNativeDriver: true, speed: 30, bounciness: 6 }),
      Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }),
    ]).start();
  };

  const onTabPress = (key) => {
    setActiveTab(key);
    animateTab(key);
    if (embedded) return;
    if (key === "snacks") router.push("/Member/SnackOrderPage");
    if (key === "leaves") router.push("/Member/ActivityCalendarScreen");
    if (key === "home") router.push("/Member/MemberDashboard");
    if (key === "bill") router.push("/Member/MemberBill");
    if (key === "profile") router.push("/Member/MemberProfile");
  };

  const openApplyWithSelectedDate = () => {
    const seedDate = selectedDate && selectedDate.getMonth() === monthIndex && selectedDate.getFullYear() === year
      ? selectedDate
      : new Date(year, monthIndex, 1);
    const ymd = monthKeyLocal(seedDate);
    const day = String(seedDate.getDate()).padStart(2, "0");
    const seedYmd = `${ymd}-${day}`;
    setApplyStartDate(seedYmd);
    setApplyEndDate(seedYmd);
    setApplyReason("");
    setIsApplyModalOpen(true);
  };

  const submitLeaveApplication = async () => {
    if (!memberId) return;
    if (!applyStartDate || !applyEndDate) {
      Alert.alert("Missing dates", "Please select start and end date.");
      return;
    }
    if (new Date(applyEndDate) < new Date(applyStartDate)) {
      Alert.alert("Invalid range", "End date must be on or after start date.");
      return;
    }

    try {
      setSubmittingLeave(true);
      await api.post("/api/leave/apply", {
        memberId,
        startDate: applyStartDate,
        endDate: applyEndDate,
        reason: applyReason.trim(),
        type: "Leave",
      });
      setIsApplyModalOpen(false);
      await loadMonthData(true);
      Alert.alert("Success", "Leave request submitted successfully.");
    } catch (error) {
      console.error("Leave apply error:", error);
      Alert.alert("Error", error?.response?.data?.message || "Failed to submit leave request.");
    } finally {
      setSubmittingLeave(false);
    }
  };

  const renderDayTile = ({ item, index }) => {
    if (!item) return <View style={styles.dayPlaceholder} />;
    const isSelected = item === selectedDay;
    const isLeaveTaken = leaveTakenDays.has(item);

    return (
      <TouchableOpacity
        style={[
          styles.dayTile,
          isLeaveTaken ? styles.dayTileLeave : styles.dayTileAvailable,
          isSelected && styles.dayTileSelected,
          index % 7 !== 6 && styles.dayTileSpacing,
        ]}
        activeOpacity={0.88}
        onPress={() => onPickDay(item)}
      >
        <Text
          style={[
            styles.dayTileText,
            isLeaveTaken ? styles.dayTileTextLeave : styles.dayTileTextAvailable,
            isSelected && styles.dayTileTextSelected,
          ]}
        >
          {item}
        </Text>
      </TouchableOpacity>
    );
  };

  const contentBottomPadding = embedded ? 24 : 118;

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={embedded ? ["left", "right", "bottom"] : ["top", "left", "right", "bottom"]}
    >
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[styles.pageContent, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMonthData(true)} tintColor={PRIMARY} />}
      >
        <View style={[styles.heroHeader, { paddingTop: embedded ? 14 : insets.top + 14 }]}>
          <Ionicons name="fast-food-outline" size={84} color="rgba(255,255,255,0.11)" style={styles.patternOne} />
          <Ionicons name="pizza-outline" size={58} color="rgba(255,255,255,0.11)" style={styles.patternTwo} />
          <Ionicons name="ice-cream-outline" size={44} color="rgba(255,255,255,0.10)" style={styles.patternThree} />

          <View style={styles.heroTopRow}>
            <TouchableOpacity
              style={styles.roundedIconBtn}
              activeOpacity={0.85}
              onPress={() => {
                if (embedded) onTabPress("home");
                else router.back();
              }}
            >
              <Ionicons name="chevron-back" size={18} color={TEXT_DARK} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.historyPill}
              activeOpacity={0.9}
              onPress={() => router.push("/Member/LeaveHistoryScreen")}
            >
              <Ionicons name="time-outline" size={14} color={PRIMARY} />
              <Text style={styles.historyPillText}>Leave History</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroTitle}>My Leaves</Text>
          <Text style={styles.heroSubtitle}>Manage your leave days easily</Text>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.monthRow}>
            <TouchableOpacity style={styles.monthNavBtn} activeOpacity={0.88} onPress={() => onChangeMonth(-1)}>
              <Ionicons name="chevron-back" size={18} color={PRIMARY} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{monthTitle}</Text>
            <TouchableOpacity style={styles.monthNavBtn} activeOpacity={0.88} onPress={() => onChangeMonth(1)}>
              <Ionicons name="chevron-forward" size={18} color={PRIMARY} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekStrip}>
            {WEEKDAY_LABELS.map((day) => (
              <Text key={day} style={styles.weekStripText}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIconBox}>
              <Ionicons name="calendar-outline" size={15} color={PRIMARY} />
              </View>
              <View style={styles.summaryMainBlock}>
                <Text style={styles.summaryTitle}>Monthly Leave Days</Text>
                <Text style={styles.summaryValue}>{inactiveDaysCount} Days</Text>
                <Text style={styles.summarySub}>Total Available</Text>
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <View style={styles.summaryIconBox}>
                <Ionicons name="receipt-outline" size={15} color={TEXT_MUTE} />
              </View>
              <View style={styles.summaryMainBlock}>
                <Text style={styles.summaryTitle}>Monthly Bill</Text>
                <Text style={styles.billValue}>{billSummaryText}</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{monthlyStatus}</Text>
              </View>
            </View>
          </View>

          {loading && (
            <View style={styles.loadingInline}>
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text style={styles.loadingInlineText}>Loading month data...</Text>
            </View>
          )}

          <FlatList
            data={calendarData}
            keyExtractor={(_, index) => `cell-${index}`}
            renderItem={renderDayTile}
            numColumns={7}
            scrollEnabled={false}
            contentContainerStyle={styles.calendarList}
          />

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#F59AA4" }]} />
              <Text style={styles.legendText}>Leave Taken</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotSelected} />
              <Text style={styles.legendText}>Selected</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.applyCard} activeOpacity={0.9} onPress={openApplyWithSelectedDate}>
            <View style={styles.applyIconBox}>
              <Ionicons name="calendar-outline" size={18} color={PRIMARY} />
            </View>
            <View style={styles.applyTextWrap}>
              <Text style={styles.applyTitle}>Apply for Leave</Text>
              <Text style={styles.applySub}>Select dates and submit your leave request</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={TEXT_MUTE} />
          </TouchableOpacity>

          <View style={styles.statsCard}>
            <View style={styles.statsBlock}>
              <Text style={styles.statsLabel}>Leaves Taken</Text>
              <Text style={styles.statsValue}>{inactiveDaysCount} Days</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsBlock}>
              <Text style={styles.statsLabel}>Leaves Available</Text>
              <Text style={styles.statsValue}>{leavesAvailableCount} Days</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsBlock}>
              <Text style={styles.statsLabel}>Next Reset Date</Text>
              <Text style={styles.statsValue}>{formatDateLabel(nextResetDate)}</Text>
            </View>
          </View>

          {!loading && !memberDetails && (
            <Text style={styles.emptyHintText}>No member data found for this account.</Text>
          )}
        </View>
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={isApplyModalOpen}
        onRequestClose={() => setIsApplyModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apply for Leave</Text>
            <Text style={styles.modalLabel}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              value={applyStartDate}
              onChangeText={setApplyStartDate}
              style={styles.modalInput}
              placeholder="2026-04-23"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              value={applyEndDate}
              onChangeText={setApplyEndDate}
              style={styles.modalInput}
              placeholder="2026-04-23"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>Reason</Text>
            <TextInput
              value={applyReason}
              onChangeText={setApplyReason}
              style={[styles.modalInput, styles.modalReasonInput]}
              placeholder="Enter reason for leave"
              placeholderTextColor="#94A3B8"
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                activeOpacity={0.88}
                onPress={() => setIsApplyModalOpen(false)}
                disabled={submittingLeave}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSubmitBtn]}
                activeOpacity={0.88}
                onPress={submitLeaveApplication}
                disabled={submittingLeave}
              >
                <Text style={styles.modalSubmitText}>{submittingLeave ? "Submitting..." : "Submit"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!embedded && (
        <View style={[styles.bottomBarWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.bottomBar}>
            {[
              { key: "snacks", label: "Extra Snacks", icon: "fast-food-outline" },
              { key: "leaves", label: "Leaves", icon: "calendar-outline" },
              { key: "home", label: "Home", icon: "home-outline" },
              { key: "bill", label: "Bill", icon: "receipt-outline" },
              { key: "profile", label: "Profile", icon: "person-outline" },
            ].map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <TouchableOpacity key={tab.key} style={styles.bottomTab} activeOpacity={0.85} onPress={() => onTabPress(tab.key)}>
                  <Animated.View style={{ transform: [{ scale: getScale(tab.key) }] }}>
                    <Ionicons name={tab.icon} size={isActive ? 22 : 19} color={isActive ? PRIMARY : "#94A3B8"} />
                  </Animated.View>
                  <Text style={[styles.bottomTabLabel, isActive && styles.bottomTabLabelActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 0,
  },
  heroHeader: {
    backgroundColor: PRIMARY,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 14,
    paddingBottom: 74,
    overflow: "hidden",
  },
  patternOne: {
    position: "absolute",
    right: -6,
    top: 18,
    transform: [{ rotate: "-8deg" }],
  },
  patternTwo: {
    position: "absolute",
    left: 132,
    top: 18,
    transform: [{ rotate: "12deg" }],
  },
  patternThree: {
    position: "absolute",
    right: 58,
    top: 54,
    transform: [{ rotate: "8deg" }],
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roundedIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#E7F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  historyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  historyPillText: {
    color: "#25515D",
    fontWeight: "700",
    fontSize: 12,
  },
  heroTitle: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  heroSubtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: "500",
  },
  mainCard: {
    marginTop: 0,
    marginHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 9,
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#E9F7F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#16233B",
  },
  weekStrip: {
    flexDirection: "row",
    backgroundColor: "#F3F5F8",
    borderRadius: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  weekStripText: {
    flex: 1,
    textAlign: "center",
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#EAEFF5",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
  },
  summaryIconBox: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: "#E8F8F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  summaryMainBlock: {
    flex: 1,
  },
  summaryTitle: {
    color: "#172554",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryValue: {
    marginTop: 2,
    color: PRIMARY,
    fontSize: 21,
    fontWeight: "800",
  },
  summarySub: {
    marginTop: 1,
    color: TEXT_MUTE,
    fontSize: 11,
    fontWeight: "500",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#EDF2F7",
  },
  billValue: {
    marginTop: 3,
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "600",
  },
  pendingBadge: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#E08C94",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pendingBadgeText: {
    color: "#9F2430",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarList: {
    marginTop: 8,
  },
  dayPlaceholder: {
    width: "13%",
    aspectRatio: 1,
    marginBottom: 6,
  },
  dayTile: {
    width: "13%",
    aspectRatio: 1,
    borderRadius: 7,
    borderWidth: 1.1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  dayTileSpacing: {
    marginRight: "1.5%",
  },
  dayTileAvailable: {
    backgroundColor: GREEN_BG,
    borderColor: "#B7EBD1",
  },
  dayTileLeave: {
    backgroundColor: RED_BG,
    borderColor: "#F8CDD2",
  },
  dayTileSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#1F2937",
    borderWidth: 2,
  },
  dayTileText: {
    fontSize: 15,
    fontWeight: "700",
  },
  dayTileTextAvailable: {
    color: GREEN_TEXT,
  },
  dayTileTextLeave: {
    color: RED_TEXT,
  },
  dayTileTextSelected: {
    color: "#111827",
  },
  legendRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDotSelected: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.4,
    borderColor: "#111827",
  },
  legendText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
  },
  applyCard: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EBF0F5",
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  applyIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#E8F8F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  applyTextWrap: {
    flex: 1,
  },
  applyTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },
  applySub: {
    marginTop: 2,
    color: TEXT_MUTE,
    fontSize: 11,
    fontWeight: "500",
  },
  statsCard: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    paddingVertical: 9,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  statsBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statsLabel: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 10,
    fontWeight: "500",
  },
  statsValue: {
    marginTop: 3,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  statsDivider: {
    width: 1,
    height: "78%",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  loadingInline: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingInlineText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyHintText: {
    marginTop: 10,
    textAlign: "center",
    color: TEXT_MUTE,
    fontSize: 12,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  modalTitle: {
    color: TEXT_DARK,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  modalLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
    marginTop: 7,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: TEXT_DARK,
    fontSize: 13,
    fontWeight: "500",
  },
  modalReasonInput: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  modalActions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalBtn: {
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  modalCancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  modalSubmitBtn: {
    backgroundColor: PRIMARY,
  },
  modalCancelText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  modalSubmitText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  bottomBarWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
  },
  bottomBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bottomTabLabel: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "700",
  },
  bottomTabLabelActive: {
    color: PRIMARY,
  },
});

