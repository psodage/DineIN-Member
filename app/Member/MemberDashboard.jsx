import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  AppState,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import api from "../../lib/api";
import { getDefaultMessMenuForDate } from "../../lib/defaultMessMenu";
import {
  displayMealPlanMr,
  displayStatusMr,
  formatPollQuestion,
  formatPollOptionLabel,
} from "../../lib/memberLabelsMr";

/**
 * - 401: handled globally by `api` (logout); don't spam the console.
 * - Network Error (no response): device can't reach `EXPO_PUBLIC_API_BASE_URL`
 *   (backend down, wrong IP, different Wi‑Fi, or need tunnel URL). Throttle logs.
 */
let lastDashboardNetworkLogAt = 0;
const DASHBOARD_NETWORK_LOG_THROTTLE_MS = 60_000;

/** Calendar YYYY-MM-DD in the device local zone (not UTC). Matches how menu dates are picked in the admin app. */
const toLocalDateKey = (dateLike) => {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
};

/**
 * For GET /api/polls?date= we send a stable local calendar key (YYYY-MM-DD).
 * Backend buckets by UTC day of the parsed date; using a plain date string avoids
 * “local midnight → previous UTC day” issues that can make polls disappear early.
 */
const toPollApiDateKey = () => toLocalDateKey(new Date());

const menuDisplayLine = (item, language, field) => {
  const en = item?.[field];
  const mr = item?.[`${field}Mr`];
  return language === "mr"
    ? String(mr || en || "").trim()
    : String(en || mr || "").trim();
};

const collectDays = (start, end) => {
  const out = [];
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    const key = toLocalDateKey(cur);
    if (key) out.push(key);
  }
  return out;
};

/**
 * Poll `date` in the API is UTC start-of bucket (see backend `toUtcDayRange`), not “local calendar midnight”.
 * Comparing `toLocalDateKey(poll.date)` to “today” wrongly hides polls in positive-offset TZs (e.g. IST).
 * GET /api/polls?date= already scopes to the day we asked for; rely on `expiresAt` for end-of-window.
 */
const isPollLiveForMember = (poll) => {
  if (!poll?._id) return false;
  if (poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now()) return false;
  return true;
};

const logDashboardApiError = (label, error) => {
  if (error?.response?.status === 401) return;

  const isNetwork =
    !error?.response &&
    (error?.message === "Network Error" ||
      error?.code === "ERR_NETWORK" ||
      String(error?.message || "").includes("Network"));

  if (isNetwork) {
    const now = Date.now();
    if (now - lastDashboardNetworkLogAt < DASHBOARD_NETWORK_LOG_THROTTLE_MS) return;
    lastDashboardNetworkLogAt = now;
    console.warn(
      `${label} Network unreachable — is the backend running and is EXPO_PUBLIC_API_BASE_URL reachable from this device? (${error?.message || "Network Error"})`
    );
    return;
  }

  console.error(label, error);
};

const MemberDashboard = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { t, language } = useLanguage();

  const [billLoading, setBillLoading] = useState(true);
  const [billError, setBillError] = useState("");
  const [billMonthOffset, setBillMonthOffset] = useState(0); // 0 = current month, -1 = previous month, etc.
  const [billRefreshNonce, setBillRefreshNonce] = useState(0); // refresh after approving bill splits
  const [bill, setBill] = useState({
    total: 0,
    paid: 0,
    remaining: 0,
  });
  const [billingDailyRate, setBillingDailyRate] = useState(0);
  const [billingExpenseShare, setBillingExpenseShare] = useState(0);

  const [splitNotifLoading, setSplitNotifLoading] = useState(false);
  const [splitNotifError, setSplitNotifError] = useState("");
  const [billSplitNotifications, setBillSplitNotifications] = useState([]);
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [splitApproveLoadingId, setSplitApproveLoadingId] = useState(null);
  const [splitRejectLoadingId, setSplitRejectLoadingId] = useState(null);
  const splitPendingPollInFlightRef = useRef(false);
  const splitModalOpenedForRequestIdRef = useRef(null);
  const [previousMonthTotal, setPreviousMonthTotal] = useState(null);
  const [previousMonthLabel, setPreviousMonthLabel] = useState("");

  const [financeLoading, setFinanceLoading] = useState(true);
  const [financeError, setFinanceError] = useState("");
  const [memberFinance, setMemberFinance] = useState({
    totalMessFee: 0,
    snackdueamount: 0,
    mealPlan: "",
    mealPlanMr: "",
  });
  // Cache snack totals per month offset so the monthly bill card
  // always shows the correct value for the selected month.
  const [snacksAmountByMonthOffset, setSnacksAmountByMonthOffset] = useState({});
  const [inactiveDays, setInactiveDays] = useState(0);
  // Date-only keys (YYYY-MM-DD, local) of chargeable leave days from billing API.
  const [chargeableLeaveDayKeys, setChargeableLeaveDayKeys] = useState([]);
  const [memberJoiningDate, setMemberJoiningDate] = useState(null);
  const [memberEmailDb, setMemberEmailDb] = useState("");
  const [memberDuePayment, setMemberDuePayment] = useState(0);

  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [todaysMenu, setTodaysMenu] = useState(null);

  const [pollLoading, setPollLoading] = useState(true);
  const [pollError, setPollError] = useState("");
  const [todaysPoll, setTodaysPoll] = useState(null);
  const [pollVoting, setPollVoting] = useState(false);
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const pollModalOpenedForPollIdRef = useRef(null);

  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [latestLeaveRequest, setLatestLeaveRequest] = useState(null);
  const [latestActivationRequest, setLatestActivationRequest] = useState(null);
  const [memberLeaveRequests, setMemberLeaveRequests] = useState([]);

  const [memberStatusDb, setMemberStatusDb] = useState(null);
  const [memberStatusMrDb, setMemberStatusMrDb] = useState(null);
  const effectiveMemberStatusRaw = (memberStatusDb ?? user?.status ?? "Active").toString();
  const memberStatus = effectiveMemberStatusRaw.trim() || "Active";
  const isInactiveMember = memberStatus.toLowerCase() === "inactive";

  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    const fetchCurrentMonthBill = async () => {
      if (!user?.id) {
        setBillLoading(false);
        return;
      }

      try {
        setBillLoading(true);
        setBillError("");

        // Legacy payment-based flow kept below, but normalized billing below returns early.
        const allPayments = [];

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const isFirstDayOfMonth = now.getDate() === 1;

        const memberId = String(user.id);
        const memberNameLower = (user.name || "").trim().toLowerCase();

        // New normalized billing: compute totals dynamically in backend.
        // This avoids relying on stored `totalMessFee/snackdueamount` fields.
        const billingRes = await api.get(`/api/member/${user.id}/billing`, {
          params: { monthOffset: billMonthOffset },
        });
        const billing = billingRes?.data || {};
        const paid = Number(billing.paidAmount || 0);
        const total = Number(billing.totalBill || 0);
        const remaining = Number(billing.remainingAmount || 0);

        setBillingDailyRate(Number(billing.dailyRate || 0));
        setBillingExpenseShare(Number(billing.expenseShare || 0));

        setMemberFinance((prev) => ({
          totalMessFee: Number(billing.mealAmount || 0),
          snackdueamount: Number(billing.snacksAmount || 0),
          mealPlan: String(
            billing?.mealPlan || prev?.mealPlan || user?.mealPlan || ""
          ),
          mealPlanMr: String(
            billing?.mealPlanMr || prev?.mealPlanMr || user?.mealPlanMr || ""
          ),
        }));
        // Store per-offset snack totals for accurate month switching.
        setSnacksAmountByMonthOffset((prev) => ({
          ...prev,
          [String(billMonthOffset)]: Number(billing.snacksAmount || 0),
        }));
        setInactiveDays(
          Number(
            billing.chargeableLeaveDays ?? billing.inactiveDays ?? 0
          )
        );
        setChargeableLeaveDayKeys(
          Array.isArray(billing.chargeableLeaveDayKeys)
            ? billing.chargeableLeaveDayKeys
            : []
        );

        // Show previous month only while viewing current month.
        if (isFirstDayOfMonth && billMonthOffset === 0) {
          const prevRes = await api.get(`/api/member/${user.id}/billing`, {
            params: { monthOffset: -1 },
          });
          const prevBilling = prevRes?.data || {};
          setPreviousMonthTotal(Number(prevBilling.totalBill || 0));

          const prev = new Date(now.getFullYear(), currentMonth - 1, 1);
          const monthName = prev.toLocaleString("en-IN", { month: "short" });
          setPreviousMonthLabel(`${monthName} ${prev.getFullYear()}`);
        } else {
          setPreviousMonthTotal(null);
          setPreviousMonthLabel("");
        }

        setBill({ paid, total, remaining });
        return;

        if (isFirstDayOfMonth) {
          const prev = new Date(currentYear, currentMonth - 1, 1);
          const prevYear = prev.getFullYear();
          const prevMonth = prev.getMonth();

          const memberPaymentsForPrevMonth = allPayments.filter((p) => {
            if (!p.month) return false;
            const monthDate = new Date(p.month);
            if (
              monthDate.getFullYear() !== prevYear ||
              monthDate.getMonth() !== prevMonth
            ) {
              return false;
            }

            const sid = p.studentId;
            const sidStr =
              typeof sid === "string"
                ? sid
                : sid && sid._id
                ? String(sid._id)
                : "";

            const paymentNameLower = (p.studentName || "")
              .trim()
              .toLowerCase();

            return (
              sidStr === memberId ||
              (memberNameLower && paymentNameLower === memberNameLower)
            );
          });

          if (memberPaymentsForPrevMonth.length > 0) {
            memberPaymentsForPrevMonth.sort((a, b) => {
              const aDate = new Date(a.date || a.createdAt || 0);
              const bDate = new Date(b.date || b.createdAt || 0);
              return bDate - aDate;
            });
            const latestPrev = memberPaymentsForPrevMonth[0];
            setPreviousMonthTotal(Number(latestPrev.totalMessFee) || 0);
          } else {
            setPreviousMonthTotal(0);
          }

          const monthName = prev.toLocaleString("en-IN", { month: "short" });
          setPreviousMonthLabel(`${monthName} ${prevYear}`);
        } else {
          setPreviousMonthTotal(null);
          setPreviousMonthLabel("");
        }

        const memberPaymentsForCurrentMonth = allPayments.filter((p) => {
          if (!p.month) return false;
          const monthDate = new Date(p.month);
          if (
            monthDate.getFullYear() !== currentYear ||
            monthDate.getMonth() !== currentMonth
          ) {
            return false;
          }

          const sid = p.studentId;
          const sidStr =
            typeof sid === "string"
              ? sid
              : sid && sid._id
              ? String(sid._id)
              : "";

          const paymentNameLower = (p.studentName || "")
            .trim()
            .toLowerCase();

          return (
            sidStr === memberId ||
            (memberNameLower && paymentNameLower === memberNameLower)
          );
        });

        if (memberPaymentsForCurrentMonth.length > 0) {
          memberPaymentsForCurrentMonth.sort((a, b) => {
            const aDate = new Date(a.date || a.createdAt || 0);
            const bDate = new Date(b.date || b.createdAt || 0);
            return bDate - aDate;
          });

          const latest = memberPaymentsForCurrentMonth[0];
          const paid = Number(latest.paidAmount) || 0;
          setBill({
            paid,
            total: 0,
            remaining: 0,
          });
        } else {
          setBill({
            paid: 0,
            total: 0,
            remaining: 0,
          });
        }
      } catch (error) {
        logDashboardApiError("Failed to load current month bill:", error);
        if (error?.response?.status === 401) return;
        setBillError("Unable to load current bill right now.");
      } finally {
        setBillLoading(false);
      }
    };

    if (isAuthenticated && !loading) {
      fetchCurrentMonthBill();
    } else {
      setBillLoading(false);
      setBillError("");
      setBill({ total: 0, paid: 0, remaining: 0 });
      setPreviousMonthTotal(null);
      setPreviousMonthLabel("");
      setInactiveDays(0);
      setChargeableLeaveDayKeys([]);
      setBillingDailyRate(0);
      setBillingExpenseShare(0);
    }
  }, [user?.id, isAuthenticated, loading, billMonthOffset, billRefreshNonce]);

  useEffect(() => {
    const fetchBillSplitNotifications = async () => {
      if (splitPendingPollInFlightRef.current) return;
      try {
        splitPendingPollInFlightRef.current = true;
        setSplitNotifLoading(true);
        setSplitNotifError("");
        setBillSplitNotifications([]);

        if (!user?.id) return;

        const res = await api.get("/api/bill-splits/notifications", {
          params: { limit: 50 },
        });
        const notifications = Array.isArray(res?.data?.notifications)
          ? res.data.notifications
          : [];

        setBillSplitNotifications(notifications);
      } catch (error) {
        logDashboardApiError("Failed to load bill split notifications:", error);
        if (error?.response?.status !== 401) {
          setSplitNotifError(
            error?.response?.data?.message ||
              "Unable to load split notifications right now."
          );
        }
        setBillSplitNotifications([]);
      } finally {
        setSplitNotifLoading(false);
        splitPendingPollInFlightRef.current = false;
      }
    };

    if (isAuthenticated && !loading && !isInactiveMember) {
      fetchBillSplitNotifications();
      // Poll for new requests, but keep it slow to avoid rate-limits.
      const intervalId = setInterval(fetchBillSplitNotifications, 15000);
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") fetchBillSplitNotifications();
      });
      return () => {
        clearInterval(intervalId);
        sub.remove();
      };
    } else {
      setBillSplitNotifications([]);
    }
  }, [user?.id, isAuthenticated, loading, isInactiveMember, billRefreshNonce]);

  // Auto-open split request modal on member app open when a new actionable request exists.
  useEffect(() => {
    if (!isAuthenticated || loading || isInactiveMember) return;
    if (splitNotifLoading) return;

    const actionable = Array.isArray(billSplitNotifications)
      ? billSplitNotifications.filter((n) => !!n?.isActionable)
      : [];

    if (actionable.length === 0) {
      if (!splitModalVisible) splitModalOpenedForRequestIdRef.current = null;
      return;
    }

    const rid = String(actionable[0]?._id || "");
    if (!rid) return;

    if (splitModalOpenedForRequestIdRef.current !== rid) {
      splitModalOpenedForRequestIdRef.current = rid;
      setSplitModalVisible(true);
    }
  }, [
    isAuthenticated,
    loading,
    isInactiveMember,
    splitNotifLoading,
    billSplitNotifications,
    splitModalVisible,
  ]);

  useEffect(() => {
    const fetchFinance = async () => {
      if (!user?.id) {
        setFinanceLoading(false);
        return;
      }

      try {
        setFinanceLoading(true);
        setFinanceError("");

        const [memberRes] = await Promise.all([api.get(`/api/members/${user.id}`)]);

        const m = memberRes?.data || {};
        setMemberStatusDb(m.status ? String(m.status) : null);
        setMemberStatusMrDb(m.statusMr != null ? String(m.statusMr) : null);
        setMemberJoiningDate(m.joiningDate ? new Date(m.joiningDate) : null);
        setMemberEmailDb(String(m.email || m?.userId?.email || ""));
        setMemberDuePayment(Number(m?.duePayment ?? m?.dueAmount ?? 0));
        // Preserve `totalMessFee/snackdueamount` values from the billing endpoint effect.
        // Only update mealPlan/status here.
        setMemberFinance((prev) => ({
          ...prev,
          mealPlan: String(m.mealPlan || user?.mealPlan || prev?.mealPlan || ""),
          mealPlanMr: String(
            m.mealPlanMr || user?.mealPlanMr || prev?.mealPlanMr || ""
          ),
        }));
      } catch (error) {
        logDashboardApiError("Failed to load member finance:", error);
        if (error?.response?.status === 401) return;
        setFinanceError(
          error?.response?.data?.message ||
            "Unable to load bill breakdown right now."
        );
        setMemberFinance((prev) => ({
          ...prev,
          totalMessFee: 0,
          snackdueamount: 0,
          mealPlan: String(prev?.mealPlan || user?.mealPlan || ""),
          mealPlanMr: String(prev?.mealPlanMr || user?.mealPlanMr || ""),
        }));
        setInactiveDays(0);
        setMemberJoiningDate(null);
        setMemberDuePayment(0);
      } finally {
        setFinanceLoading(false);
      }
    };

    if (isAuthenticated && !loading) {
      fetchFinance();
    } else {
      setFinanceLoading(false);
      setFinanceError("");
      setMemberStatusDb(null);
      setMemberStatusMrDb(null);
      setMemberEmailDb("");
      setMemberDuePayment(0);
      setMemberFinance({
        totalMessFee: 0,
        snackdueamount: 0,
        mealPlan: String(user?.mealPlan || ""),
        mealPlanMr: String(user?.mealPlanMr || ""),
      });
      setMemberJoiningDate(null);
    }
  }, [user?.id, isAuthenticated, loading]);

  // Keep member status in sync so the UI switches immediately after admin actions
  // (e.g., approving a leave request sets member.status = "Inactive").
  useEffect(() => {
    if (!isAuthenticated || loading || !user?.id) return;

    let stopped = false;

    const fetchMemberStatus = async () => {
      try {
        const memberRes = await api.get(`/api/members/${user.id}`);
        if (stopped) return;
        const m = memberRes?.data || {};
        setMemberStatusDb(m.status ? String(m.status) : null);
        setMemberStatusMrDb(m.statusMr != null ? String(m.statusMr) : null);
      } catch (error) {
        // Ignore periodic refresh failures; the main dashboard fetch already shows errors.
        if (error?.response?.status === 401) return;
      }
    };

    fetchMemberStatus();
    const intervalId = setInterval(fetchMemberStatus, 20_000);
    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }, [user?.id, isAuthenticated, loading]);

  // Slider restriction: show only months on/after the member joined, and never beyond current month.
  useEffect(() => {
    if (!memberJoiningDate || Number.isNaN(memberJoiningDate.getTime())) return;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const joinMonthStart = new Date(
      memberJoiningDate.getFullYear(),
      memberJoiningDate.getMonth(),
      1
    );

    const offsetJoin =
      (joinMonthStart.getFullYear() - currentMonthStart.getFullYear()) * 12 +
      (joinMonthStart.getMonth() - currentMonthStart.getMonth());

    // Never allow "future" months relative to the current month.
    const minAllowed = Math.min(offsetJoin, 0);

    if (billMonthOffset < minAllowed) setBillMonthOffset(minAllowed);
    if (billMonthOffset > 0) setBillMonthOffset(0);
  }, [memberJoiningDate, billMonthOffset]);

  useEffect(() => {
    const fetchTodaysMenu = async () => {
      try {
        setMenuLoading(true);
        setMenuError("");

        const res = await api.get("/api/menu");
        const menus = Array.isArray(res.data) ? res.data : [];

        const todayKey = toLocalDateKey(new Date());
        const found =
          menus.find((m) => {
            if (!m?.date) return false;
            return toLocalDateKey(m.date) === todayKey;
          }) || null;

        setTodaysMenu(found);
      } catch (error) {
        logDashboardApiError("Failed to load today's menu:", error);
        if (error?.response?.status === 401) return;
        setMenuError(
          error?.response?.data?.message || "Unable to load today's menu right now."
        );
        setTodaysMenu(null);
      } finally {
        setMenuLoading(false);
      }
    };

    if (isAuthenticated && !loading && !isInactiveMember) {
      fetchTodaysMenu();
    } else {
      setMenuLoading(false);
      setMenuError("");
      setTodaysMenu(null);
    }
  }, [isAuthenticated, loading, isInactiveMember]);

  const fetchTodaysPoll = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      if (!isAuthenticated || loading || isInactiveMember) {
        if (!silent) {
          setPollLoading(false);
          setPollError("");
          setTodaysPoll(null);
        }
        return;
      }
      try {
        if (!silent) {
          setPollLoading(true);
          setPollError("");
        }
        const pollDateKey = toPollApiDateKey();
        const res = await api.get(`/api/polls?date=${pollDateKey}`);
        setTodaysPoll(res.data || null);
      } catch (error) {
        logDashboardApiError("Failed to load today's poll:", error);
        if (error?.response?.status === 401) return;
        if (!silent) {
          setPollError(
            error?.response?.data?.message || "Unable to load today's poll right now."
          );
        }
        setTodaysPoll(null);
      } finally {
        if (!silent) setPollLoading(false);
      }
    },
    [isAuthenticated, loading, isInactiveMember]
  );

  useEffect(() => {
    fetchTodaysPoll();
  }, [fetchTodaysPoll]);

  useFocusEffect(
    useCallback(() => {
      fetchTodaysPoll({ silent: true });
    }, [fetchTodaysPoll])
  );

  useEffect(() => {
    if (!isAuthenticated || loading || isInactiveMember) return undefined;
    const id = setInterval(() => fetchTodaysPoll({ silent: true }), 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated, loading, isInactiveMember, fetchTodaysPoll]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchTodaysPoll({ silent: true });
    });
    return () => sub.remove();
  }, [fetchTodaysPoll]);

  // Auto-open poll modal on member app open when poll is live and they haven't voted yet.
  useEffect(() => {
    if (!isAuthenticated || loading || isInactiveMember) return;
    if (pollLoading) return;
    if (!todaysPoll || !isPollLiveForMember(todaysPoll)) return;
    if (todaysPoll.myVote) {
      // If they've already voted, make sure modal isn't showing.
      setPollModalVisible(false);
      return;
    }

    const pid = String(todaysPoll?._id || "");
    if (!pid) return;

    if (pollModalOpenedForPollIdRef.current !== pid) {
      pollModalOpenedForPollIdRef.current = pid;
      setPollModalVisible(true);
    }
  }, [isAuthenticated, loading, isInactiveMember, pollLoading, todaysPoll]);

  const fetchMyRequests = async () => {
    if (!user?.id) {
      setRequestLoading(false);
      return;
    }

    try {
      setRequestLoading(true);
      setRequestError("");
      const res = await api.get(`/api/leave/student/${user.id}`);
      const list = Array.isArray(res.data) ? res.data : [];
      setMemberLeaveRequests(list);

      const byLatestFirst = (a, b) => {
        const aTime = new Date(
          a?.updatedAt || a?.createdAt || a?.startDate || 0
        ).getTime();
        const bTime = new Date(
          b?.updatedAt || b?.createdAt || b?.startDate || 0
        ).getTime();
        return bTime - aTime;
      };

      const leaveRequests = list
        .filter((r) => String(r?.type || "Leave").toLowerCase() === "leave")
        .sort(byLatestFirst);
      const activationRequests = list
        .filter((r) => String(r?.type || "").toLowerCase() === "activation")
        .sort(byLatestFirst);

      const latestLeave = leaveRequests[0] || null;
      const latestActivation = activationRequests[0] || null;

      setLatestLeaveRequest(latestLeave);
      setLatestActivationRequest(latestActivation);
    } catch (error) {
      logDashboardApiError("Failed to load member requests:", error);
      if (error?.response?.status === 401) return;
      setRequestError(
        error?.response?.data?.message || "Unable to load request status."
      );
      setLatestLeaveRequest(null);
      setLatestActivationRequest(null);
      setMemberLeaveRequests([]);
    } finally {
      setRequestLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !loading) {
      fetchMyRequests();
    } else {
      setRequestLoading(false);
      setRequestError("");
      setLatestLeaveRequest(null);
      setLatestActivationRequest(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAuthenticated, loading]);

  const getStatusPillStyle = (status) => {
    const s = String(status || "Pending").toLowerCase();
    if (s === "approved") {
      return { bg: "#DCFCE7", text: "#166534" };
    }
    if (s === "rejected") {
      return { bg: "#FEE2E2", text: "#B91C1C" };
    }
    return { bg: "#FEF3C7", text: "#92400E" };
  };

  const RequestStatusRow = ({ label, status }) => {
    const pill = getStatusPillStyle(status);
    return (
      <View style={styles.requestRow}>
        <Text style={styles.requestLabel}>{label}</Text>
        <View style={[styles.requestPill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.requestPillText, { color: pill.text }]}>
            {status || "Pending"}
          </Text>
        </View>
      </View>
    );
  };

  const handleApproveBillSplit = async (requestId) => {
    if (!requestId) return;
    if (splitApproveLoadingId) return;

    try {
      setSplitApproveLoadingId(requestId);
      await api.put(`/api/bill-splits/${requestId}/approve`);

      // Re-fetch both billing and pending split notifications.
      setSplitModalVisible(false);
      setBillRefreshNonce((n) => n + 1);
    } catch (error) {
      console.error("Approve bill split error:", error);
      Alert.alert(
        "Bill Split",
        error?.response?.data?.message ||
          "Failed to approve bill split. Please try again."
      );
    } finally {
      setSplitApproveLoadingId(null);
    }
  };

  const handleRejectBillSplit = async (requestId) => {
    if (!requestId) return;
    if (splitRejectLoadingId) return;

    try {
      setSplitRejectLoadingId(requestId);
      await api.put(`/api/bill-splits/${requestId}/reject`);

      // Update badge/pending list and recalc bills after cancellation.
      setSplitModalVisible(false);
      setBillRefreshNonce((n) => n + 1);
    } catch (error) {
      console.error("Reject bill split error:", error);
      Alert.alert(
        "Bill Split",
        error?.response?.data?.message ||
          "Failed to reject bill split. Please try again."
      );
    } finally {
      setSplitRejectLoadingId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const memberName = user?.name || "Rahul Patil";
  const roomOwnerName = user?.roomOwnerName || "Owner Name";

  const mealPlanRaw = (
    memberFinance?.mealPlan ||
    user?.mealPlan ||
    ""
  )
    .toString()
    .trim();
  const mealPlanLower = mealPlanRaw.toLowerCase();
  const mealPlanMrStored = (
    memberFinance?.mealPlanMr ||
    user?.mealPlanMr ||
    ""
  )
    .toString()
    .trim();

  const formatCurrency = (amount) =>
    `₹${Number(amount || 0).toLocaleString("en-IN")}`;
  const billSplitActionableCount = billSplitNotifications.filter(
    (n) => n?.isActionable
  ).length;

  const formatSplitDateTime = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSplitAllocationPillStyle = (status) => {
    const s = String(status || "Pending").toLowerCase();
    if (s === "approved") {
      return { bg: "#DCFCE7", text: "#166534" };
    }
    if (s === "rejected") {
      return { bg: "#FEE2E2", text: "#B91C1C" };
    }
    // Pending (default)
    return { bg: "#FEF3C7", text: "#92400E" };
  };

  const hasMealPlan = !!mealPlanRaw;
  const mealTokens = mealPlanLower
    .split(/[^a-z]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const includesLunch = mealTokens.includes("lunch");
  const includesDinner = mealTokens.includes("dinner");
  const isBothPlan =
    mealPlanLower === "both" ||
    mealPlanLower === "lunchanddinner" ||
    mealPlanLower === "lunchdinner" ||
    (includesLunch && includesDinner);
  const hasLunch = isBothPlan || includesLunch || mealPlanLower === "lunch";
  const hasDinner = isBothPlan || includesDinner || mealPlanLower === "dinner";

  let mealPlanLabel = "";
  if (!hasMealPlan) {
    mealPlanLabel = language === "mr" ? "मील प्लॅन सेट नाही" : "Meal plan not set";
  } else if (language === "mr") {
    mealPlanLabel = displayMealPlanMr("mr", mealPlanRaw, mealPlanMrStored);
  } else if (isBothPlan) {
    mealPlanLabel = "Lunch & Dinner";
  } else if (hasLunch) {
    mealPlanLabel = "Lunch Only";
  } else if (hasDinner) {
    mealPlanLabel = "Dinner Only";
  } else {
    mealPlanLabel = mealPlanRaw;
  }

  const mealAmount = Number(memberFinance.totalMessFee || 0);
  const snacksAmountKey = String(billMonthOffset);
  const snacksAmount = Number(
    Object.prototype.hasOwnProperty.call(
      snacksAmountByMonthOffset,
      snacksAmountKey
    )
      ? snacksAmountByMonthOffset[snacksAmountKey]
      : memberFinance.snackdueamount || 0
  );
  const dailyRate = Number(billingDailyRate || 0);
  const monthStartForOffset = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + billMonthOffset, 1);
  })();
  const monthEndForOffset = new Date(
    monthStartForOffset.getFullYear(),
    monthStartForOffset.getMonth() + 1,
    0
  );
  const isCurrentMonth =
    new Date().getFullYear() === monthStartForOffset.getFullYear() &&
    new Date().getMonth() === monthStartForOffset.getMonth();
  const maxDay = isCurrentMonth ? new Date() : monthEndForOffset;
  const joinDateOnly =
    memberJoiningDate && !Number.isNaN(memberJoiningDate.getTime())
      ? new Date(
          memberJoiningDate.getFullYear(),
          memberJoiningDate.getMonth(),
          memberJoiningDate.getDate()
        )
      : null;
  const eligibleStart =
    joinDateOnly && joinDateOnly > monthStartForOffset ? joinDateOnly : monthStartForOffset;
  const eligibleEnd =
    maxDay < monthEndForOffset ? maxDay : monthEndForOffset;

  const approvedLeaveDayKeySet = (() => {
    const set = new Set();
    const list = Array.isArray(memberLeaveRequests) ? memberLeaveRequests : [];
    list
      .filter((r) => String(r?.type || "").toLowerCase() === "leave")
      .filter((r) => String(r?.status || "").toLowerCase() === "approved")
      .forEach((r) => {
        const s = new Date(r.startDate);
        const e = new Date(r.endDate);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return;
        if (s > eligibleEnd || e < eligibleStart) return;
        const clippedStart = s < eligibleStart ? eligibleStart : s;
        const clippedEnd = e > eligibleEnd ? eligibleEnd : e;
        collectDays(clippedStart, clippedEnd).forEach((k) => set.add(k));
      });
    return set;
  })();

  const eligibleDayCount = (() => {
    if (eligibleEnd < eligibleStart) return 0;
    const days = collectDays(eligibleStart, eligibleEnd);
    return days.length;
  })();

  const monthLeaveDays = approvedLeaveDayKeySet.size;
  const totalActiveDays = Math.max(0, eligibleDayCount - monthLeaveDays);
  const mealAmountFromActiveDays = totalActiveDays * dailyRate;
  const expenseShareAmount = Number(billingExpenseShare || 0);
  const computedTotalBill =
    mealAmountFromActiveDays + snacksAmount + expenseShareAmount;
  const computedRemainingAmount = Math.max(
    0,
    computedTotalBill - Number(bill.paid || 0)
  );
  const shouldShowLunch = hasLunch;
  const shouldShowDinner = hasDinner;
  const defaultMessMenuForMenuDay = getDefaultMessMenuForDate(
    todaysMenu?.date || new Date()
  );

  const inactiveStreakFilledCount = Math.min(
    Math.max(Number(inactiveDays || 0), 0),
    5
  );

  const inactiveStreakStartDate = (() => {
    const keys = Array.isArray(chargeableLeaveDayKeys)
      ? [...chargeableLeaveDayKeys]
      : [];
    keys.sort();
    const startKey = keys[0];
    if (!startKey) return null;

    const parts = startKey.split("-");
    if (parts.length !== 3) return null;
    const [y, mo, d] = parts.map((p) => Number(p));
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  })();

  const inactiveStreakCircleDates = (() => {
    const empty = Array.from({ length: 5 }, () => ({ day: "", filled: false }));
    if (inactiveStreakFilledCount <= 0) return empty;

    // If we don't have the start date keys yet, still show filled circles by count.
    if (!inactiveStreakStartDate) {
      return Array.from({ length: 5 }, (_, i) => ({
        day: "",
        filled: i < inactiveStreakFilledCount,
      }));
    }

    const startDate = new Date(inactiveStreakStartDate);
    return Array.from({ length: 5 }, (_, i) => {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + i);
      return {
        day: String(dt.getDate()),
        filled: i < inactiveStreakFilledCount,
      };
    });
  })();

  const isMealOptionMatch = (opt, mealType) => {
    const key = String(opt?.key || "").toLowerCase();
    const en = String(opt?.label || "").toLowerCase();
    const mr = String(opt?.labelMr || "").toLowerCase();
    const combined = `${key} ${en} ${mr}`.trim();
    if (!combined) return false;
    if (mealType === "lunch") {
      return combined.includes("lunch") || combined.includes("दुपार");
    }
    return combined.includes("dinner") || combined.includes("रात");
  };

  const pollOptions = Array.isArray(todaysPoll?.options) ? todaysPoll.options : [];
  const filteredPollOptions = pollOptions.filter((opt) => {
    if (shouldShowLunch && shouldShowDinner) return true;
    if (shouldShowLunch) return isMealOptionMatch(opt, "lunch");
    if (shouldShowDinner) return isMealOptionMatch(opt, "dinner");
    return false;
  });
  const visiblePollOptions =
    filteredPollOptions.length > 0 ? filteredPollOptions : pollOptions;

  const monthLabelForOffset = (offset) => {
    const d = new Date();
    const target = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    const monthName = target.toLocaleString("en-IN", { month: "short" });
    return `${monthName} ${target.getFullYear()}`;
  };
  const monthParamForOffset = (offset) => {
    const d = new Date();
    const target = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };

  const monthOffsets = (() => {
    const maxOffset = 0;
    let minOffset = 0;

    if (memberJoiningDate && !Number.isNaN(memberJoiningDate.getTime())) {
      const now = new Date();
      const currentMonthStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );
      const joinMonthStart = new Date(
        memberJoiningDate.getFullYear(),
        memberJoiningDate.getMonth(),
        1
      );

      minOffset =
        (joinMonthStart.getFullYear() - currentMonthStart.getFullYear()) *
          12 +
        (joinMonthStart.getMonth() - currentMonthStart.getMonth());

      // Clamp so we never show months after current month.
      minOffset = Math.min(minOffset, 0);
    }

    const arr = [];
    for (let o = minOffset; o <= maxOffset; o += 1) arr.push(o);
    return arr;
  })();

  const handleApplyForActivation = () => {
    const memberId = user?.id;
    if (!memberId) {
      Alert.alert("Account Inactive", "Unable to find your member record.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    Alert.alert(
      "Apply for Activation",
      "Do you want to send an activation request to the admin?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          onPress: async () => {
            try {
              await api.post("/api/leave/apply", {
                memberId,
                startDate: today,
                endDate: today,
                reason: "Account activation request",
                type: "Activation",
              });
              fetchMyRequests();
              Alert.alert(
                "Request Sent",
                "Your activation request has been sent to the admin for approval."
              );
            } catch (error) {
              console.error("Activation request error:", error);
              Alert.alert(
                "Error",
                error?.response?.data?.message ||
                  "Failed to send activation request. Please try again later."
              );
            }
          },
        },
      ]
    );
  };

  if (loading || !isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrapper}>
            <Text style={styles.welcomeText}>
              {t("Welcome") || "Welcome,"}
            </Text>
            <Text style={styles.memberName}>{memberName}</Text>
            <Text style={styles.memberMeta}>
              Room Owner: {roomOwnerName}
            
            </Text>
            <View style={styles.statusBadgeRow}>
              <Text style={styles.statusLabel}>Status: </Text>
              <View
                style={[
                  styles.statusBadge,
                  isInactiveMember ? styles.statusBadgeInactive : styles.statusBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    isInactiveMember
                      ? styles.statusBadgeTextInactive
                      : styles.statusBadgeTextActive,
                  ]}
                >
                  {displayStatusMr(
                    language,
                    memberStatus,
                    memberStatusMrDb ?? user?.statusMr
                  )}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerRightRow}>
            {!isInactiveMember && (
              <TouchableOpacity
                style={styles.notificationButton}
                activeOpacity={0.8}
                onPress={() => setSplitModalVisible(true)}
                disabled={splitNotifLoading || billSplitNotifications.length === 0}
              >
                <Ionicons
                  name="notifications-outline"
                  size={24}
                  color="#111827"
                />
                {billSplitActionableCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {billSplitActionableCount > 9
                        ? "9+"
                        : billSplitActionableCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.avatarWrapper}
              activeOpacity={0.8}
              onPress={() => router.push("/Member/MemberProfile")}
            >
              <Ionicons
                name="person-circle-outline"
                size={48}
                color="#ECFDF5"
              />
            </TouchableOpacity>
          </View>
        </View>

        {isInactiveMember ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrapper}>
                <Ionicons name="alert-circle" size={22} color="#B91C1C" />
              </View>
              <Text style={styles.cardTitle}>Account Inactive</Text>
            </View>
            <Text style={styles.inactiveText}>
              Your mess membership is currently inactive. You cannot use app
              features like viewing bills or ordering extra snacks until your
              account is activated by the administrator.
            </Text>
            <Text style={styles.inactiveText}>
              Inactive days this month counted for bill adjustment:
            </Text>

            <View style={styles.inactiveCirclesRow}>
              {inactiveStreakCircleDates.map((c, idx) => (
                <View
                  key={`inactive-circle-${idx}`}
                  style={[
                    styles.inactiveCircle,
                    c.filled
                      ? styles.inactiveCircleFilled
                      : styles.inactiveCircleEmpty,
                  ]}
                >
                  {!!c.day && (
                    <Text
                      style={[
                        styles.inactiveCircleText,
                        c.filled
                          ? styles.inactiveCircleTextFilled
                          : styles.inactiveCircleTextEmpty,
                      ]}
                    >
                      {c.day}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {requestLoading ? (
              <View style={styles.billLoadingRow}>
                <ActivityIndicator size="small" color="#111827" />
                <Text style={styles.billLoadingText}>Loading request status...</Text>
              </View>
            ) : requestError ? (
              <Text style={styles.billErrorText}>{requestError}</Text>
            ) : latestActivationRequest ? (
              <RequestStatusRow
                label="Activation Request"
                status={latestActivationRequest?.status}
              />
            ) : (
              <Text style={styles.billLoadingText}>
                No activation request submitted.
              </Text>
            )}
            <TouchableOpacity
              style={styles.activateButton}
              activeOpacity={0.85}
              onPress={handleApplyForActivation}
            >
              <Ionicons name="send-outline" size={18} color="#FFFFFF" />
              <Text style={styles.activateButtonText}>Apply for Activation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrapper}>
                  <Ionicons name="restaurant" size={22} color="#064E3B" />
                </View>
                <Text style={styles.cardTitle}>Current Meal Plan</Text>
              </View>
              {financeLoading ? (
                <View style={styles.billLoadingRow}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.billLoadingText}>Loading meal plan...</Text>
                </View>
              ) : financeError ? (
                <Text style={styles.billErrorText}>{financeError}</Text>
              ) : (
                <>
                  <Text style={styles.mealPlanType}>{mealPlanLabel}</Text>
                  <View style={styles.mealTagsRow}>
                    {hasLunch && (
                      <View style={styles.mealTag}>
                        <Text style={styles.mealTagText}>
                          {t("manage_menu_lunch") || "Lunch"}
                        </Text>
                      </View>
                    )}
                    {hasDinner && (
                      <View style={styles.mealTag}>
                        <Text style={styles.mealTagText}>
                          {t("manage_menu_dinner") || "Dinner"}
                        </Text>
                      </View>
                    )}
                    {!hasLunch && !hasDinner && (
                      <Text style={styles.billLoadingText}>
                        {language === "mr"
                          ? "तुमचा मील प्लॅन अद्याप सेट झालेला नाही."
                          : "Your meal plan is not set yet."}
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrapper}>
                  <Ionicons name="fast-food" size={22} color="#064E3B" />
                </View>
                <Text style={styles.cardTitle}>Today's Menu</Text>
              </View>
              {menuLoading ? (
                <View style={styles.billLoadingRow}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.billLoadingText}>Loading menu...</Text>
                </View>
              ) : menuError ? (
                <Text style={styles.billErrorText}>{menuError}</Text>
              ) : !todaysMenu ? (
                <>
                  <Text style={[styles.billLoadingText, { marginBottom: 10 }]}>
                    {t("member_menu_default_notice")}
                  </Text>
                  {shouldShowLunch && (
                    <View style={styles.menuRow}>
                      <Text style={styles.menuLabel}>{t("manage_menu_lunch")}: </Text>
                      <Text style={styles.menuValue}>
                        {menuDisplayLine(
                          getDefaultMessMenuForDate(new Date()),
                          language,
                          "lunch"
                        )}
                      </Text>
                    </View>
                  )}
                  {shouldShowDinner && (
                    <View style={styles.menuRow}>
                      <Text style={styles.menuLabel}>{t("manage_menu_dinner")}: </Text>
                      <Text style={styles.menuValue}>
                        {menuDisplayLine(
                          getDefaultMessMenuForDate(new Date()),
                          language,
                          "dinner"
                        )}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {shouldShowLunch && (
                    <View style={styles.menuRow}>
                      <Text style={styles.menuLabel}>{t("manage_menu_lunch")}: </Text>
                      <Text style={styles.menuValue}>
                        {menuDisplayLine(todaysMenu, language, "lunch") ||
                          menuDisplayLine(
                            defaultMessMenuForMenuDay,
                            language,
                            "lunch"
                          ) ||
                          "-"}
                      </Text>
                    </View>
                  )}
                  {shouldShowDinner && (
                    <View style={styles.menuRow}>
                      <Text style={styles.menuLabel}>{t("manage_menu_dinner")}: </Text>
                      <Text style={styles.menuValue}>
                        {menuDisplayLine(todaysMenu, language, "dinner") ||
                          menuDisplayLine(
                            defaultMessMenuForMenuDay,
                            language,
                            "dinner"
                          ) ||
                          "-"}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrapper}>
                  <Ionicons name="bar-chart-outline" size={22} color="#064E3B" />
                </View>
                <Text style={styles.cardTitle}>Today's Poll</Text>
              </View>

              {pollLoading ? (
                <View style={styles.billLoadingRow}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.billLoadingText}>Loading poll...</Text>
                </View>
              ) : pollError ? (
                <Text style={styles.billErrorText}>{pollError}</Text>
              ) : !todaysPoll || !isPollLiveForMember(todaysPoll) ? (
                <Text style={styles.billLoadingText}>
                  No poll for today.
                </Text>
              ) : (
                <>
                  <Text style={[styles.billValue, { marginTop: 6, marginBottom: 10 }]}>
                    {formatPollQuestion(todaysPoll, language) || "Meal Preference"}
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {visiblePollOptions.map((opt) => {
                      const key = String(opt?.key || "");
                      const label = formatPollOptionLabel(opt, language) || key;
                      const selected = String(todaysPoll.myVote || "") === key;
                      const disabled = pollVoting || !!todaysPoll.myVote;
                      return (
                        <TouchableOpacity
                          key={key}
                          disabled={disabled}
                          activeOpacity={0.85}
                          style={[
                            styles.pollOptionButton,
                            selected && styles.pollOptionButtonSelected,
                            disabled && !selected ? { opacity: 0.6 } : null,
                          ]}
                          onPress={async () => {
                            try {
                              setPollVoting(true);
                              const res = await api.post(
                                `/api/polls/${todaysPoll._id}/vote`,
                                { optionKey: key }
                              );
                              setTodaysPoll(res.data || null);
                            } catch (error) {
                              console.error("Vote failed:", error);
                              Alert.alert(
                                "Poll",
                                error?.response?.data?.message ||
                                  "Failed to vote. Please try again."
                              );
                            } finally {
                              setPollVoting(false);
                            }
                          }}
                        >
                          <Text
                            style={[
                              styles.pollOptionText,
                              selected && styles.pollOptionTextSelected,
                            ]}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={{ marginTop: 12 }}>
                    {visiblePollOptions.map((o) => (
                      <View key={`count-${o.key}`} style={styles.billRow}>
                        <Text style={styles.billLabel}>{formatPollOptionLabel(o, language)}</Text>
                        <Text style={styles.billValue}>
                          {Number(todaysPoll.counts?.[o.key] || 0)}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.divider} />
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>Total votes</Text>
                      <Text style={styles.billValue}>
                        {Number(todaysPoll.totalVotes || 0)}
                      </Text>
                    </View>
                    {!!todaysPoll.myVote && (
                      <Text style={[styles.billLoadingText, { marginTop: 8 }]}>
                        You voted:{" "}
                        {String(
                          formatPollOptionLabel(
                            (todaysPoll.options || []).find(
                              (o) => String(o.key) === String(todaysPoll.myVote)
                            ),
                            language
                          ) || todaysPoll.myVote
                        )}
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrapper}>
                  <Ionicons name="calendar-outline" size={22} color="#065F46" />
                </View>
                <Text style={styles.cardTitle}>Apply for Leave</Text>
              </View>
              <Text style={styles.leaveInfoText}>
                Tap once to mark leave for today. Your monthly inactive days
                will be tracked and your mess bill will adjust automatically.
              </Text>
              {requestLoading ? (
                <View style={styles.billLoadingRow}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.billLoadingText}>Loading request status...</Text>
                </View>
              ) : requestError ? (
                <Text style={styles.billErrorText}>{requestError}</Text>
              ) : latestLeaveRequest ? (
                <RequestStatusRow
                  label="Leave Request"
                  status={latestLeaveRequest?.status}
                />
              ) : (
                <Text style={styles.billLoadingText}>
                  No leave request submitted.
                </Text>
              )}
              <TouchableOpacity
                style={styles.leaveToggleButton}
                onPress={async () => {
                  if (!user?.id) {
                    Alert.alert(
                      "Leave",
                      "Unable to find your member record."
                    );
                    return;
                  }
                  try {
                    setLeaveSubmitting(true);
                    const today = new Date().toISOString().split("T")[0];
                    await api.post("/api/leave/apply", {
                      memberId: user.id,
                      startDate: today,
                      endDate: today,
                      type: "Leave",
                      reason: "Leave request",
                    });
                    fetchMyRequests();

                    Alert.alert(
                      "Leave",
                      "Your leave request has been sent to admin for approval."
                    );
                  } catch (error) {
                    console.error("Simple leave request error:", error);
                    Alert.alert(
                      "Error",
                      error?.response?.data?.message ||
                        "Failed to apply leave. Please try again."
                    );
                  } finally {
                    setLeaveSubmitting(false);
                  }
                }}
                activeOpacity={0.85}
                disabled={leaveSubmitting}
              >
                {leaveSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="add-circle-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.leaveToggleText}>Apply for Leave</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrapper}>
                  <Ionicons name="wallet" size={22} color="#064E3B" />
                </View>
                <Text style={styles.cardTitle}>Monthly Bill</Text>
                <View style={styles.cardHeaderSpacer} />
                <TouchableOpacity
                  style={styles.cardHeaderActionBtn}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: "/Member/MemberActivityCalendar",
                      params: { month: monthParamForOffset(billMonthOffset) },
                    })
                  }
                >
                  <Ionicons name="calendar-outline" size={18} color="#065F46" />
                </TouchableOpacity>
              </View>
              <View style={styles.monthSelectorBlock}>
                <Text style={styles.monthSelectorLabel}>
                  View Month:{" "}
                  <Text style={{ fontWeight: "700", color: "#111827" }}>
                    {monthLabelForOffset(billMonthOffset)}
                  </Text>
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.monthSelectorRow}
                >
                  {monthOffsets.map((offset) => {
                    const active = offset === billMonthOffset;
                    const labelParts = monthLabelForOffset(offset).split(" ");
                    const monthShort = labelParts[0] || "";
                    const yearShort = (labelParts[1] || "").slice(-2);
                    return (
                      <TouchableOpacity
                        key={String(offset)}
                        style={[styles.monthPill, active && styles.monthPillActive]}
                        activeOpacity={0.85}
                        onPress={() => setBillMonthOffset(offset)}
                      >
                        <Text
                          style={[
                            styles.monthPillText,
                            active && styles.monthPillTextActive,
                          ]}
                        >
                          {yearShort ? `${monthShort} '${yearShort}` : monthShort}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {billLoading || financeLoading ? (
                <View style={styles.billLoadingRow}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.billLoadingText}>Loading bill...</Text>
                </View>
              ) : billError || financeError ? (
                <Text style={styles.billErrorText}>{billError || financeError}</Text>
              ) : (
                <>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Total Meal Amount</Text>
                    <Text style={styles.billValue}>
                      {formatCurrency(mealAmount)}
                    </Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Total Snacks Amount</Text>
                    <Text style={styles.billValue}>
                      {formatCurrency(snacksAmount)}
                    </Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Paid</Text>
                    <Text style={styles.billValueSuccess}>
                      {formatCurrency(bill.paid)}
                    </Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Remaining</Text>
                    <Text style={styles.billValueWarning}>
                      {formatCurrency(computedRemainingAmount)}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Total Bill</Text>
                    <Text style={styles.billValue}>
                      {formatCurrency(computedTotalBill)}
                    </Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Due Payment</Text>
                    <Text style={styles.billValueWarning}>
                      {formatCurrency(memberDuePayment)}
                    </Text>
                  </View>
                  {previousMonthTotal != null && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>
                          Previous Month Total ({previousMonthLabel || "Last month"})
                        </Text>
                        <Text style={styles.billValue}>
                          {formatCurrency(previousMonthTotal)}
                        </Text>
                      </View>
                    </>
                  )}
                </>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrapper}>
                  <Ionicons name="fast-food-outline" size={22} color="#111827" />
                </View>
                <Text style={styles.cardTitle}>Extra Snacks</Text>
              </View>
              <Text style={styles.extraSnackText}>
                Order extra snacks and the amount will be added to your mess
                bill.
              </Text>
              <TouchableOpacity
                style={styles.extraSnackButton}
                activeOpacity={0.85}
                onPress={() => router.push("/Member/SnackOrderPage")}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.extraSnackButtonText}>
                  Order Extra Snacks
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={pollModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPollModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Today's Poll</Text>
              <TouchableOpacity
                onPress={() => setPollModalVisible(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            {pollLoading ? (
              <View style={styles.modalLoadingRow}>
                <ActivityIndicator size="small" color="#111827" />
                <Text style={[styles.modalBodyText, { marginLeft: 10 }]}>
                  Loading...
                </Text>
              </View>
            ) : !todaysPoll || !isPollLiveForMember(todaysPoll) ? (
              <Text style={styles.modalBodyText}>No poll available.</Text>
            ) : (
              <>
                <Text
                  style={[styles.billValue, { marginTop: 6, marginBottom: 10 }]}
                >
                  {formatPollQuestion(todaysPoll, language) ||
                    "Meal Preference"}
                </Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {visiblePollOptions.map((opt) => {
                    const key = String(opt?.key || "");
                    const label = formatPollOptionLabel(opt, language) || key;
                    const disabled = pollVoting || !!todaysPoll.myVote;
                    return (
                      <TouchableOpacity
                        key={key}
                        disabled={disabled}
                        activeOpacity={0.85}
                        style={[
                          styles.pollOptionButton,
                          key === String(todaysPoll.myVote || "") &&
                            styles.pollOptionButtonSelected,
                          disabled && key !== String(todaysPoll.myVote || "")
                            ? { opacity: 0.6 }
                            : null,
                        ]}
                        onPress={async () => {
                          try {
                            setPollVoting(true);
                            const res = await api.post(
                              `/api/polls/${todaysPoll._id}/vote`,
                              { optionKey: key }
                            );
                            setTodaysPoll(res.data || null);
                            if (res.data?.myVote) setPollModalVisible(false);
                          } catch (error) {
                            console.error("Vote failed:", error);
                            Alert.alert(
                              "Poll",
                              error?.response?.data?.message ||
                                "Failed to vote. Please try again."
                            );
                          } finally {
                            setPollVoting(false);
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.pollOptionText,
                            key === String(todaysPoll.myVote || "") &&
                              styles.pollOptionTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={splitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSplitModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bill Split Notifications</Text>
              <TouchableOpacity
                onPress={() => setSplitModalVisible(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Pending: {billSplitActionableCount} • Total:{" "}
              {billSplitNotifications.length}
            </Text>

            {splitNotifLoading ? (
              <View style={styles.modalLoadingRow}>
                <ActivityIndicator size="small" color="#111827" />
                <Text style={[styles.modalBodyText, { marginLeft: 10 }]}>
                  Loading...
                </Text>
              </View>
            ) : billSplitNotifications.length === 0 ? (
              <Text style={styles.modalBodyText}>
                {splitNotifError ? splitNotifError : "No split notifications."}
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.splitNotificationsList}>
                  {billSplitNotifications.map((reqItem) => {
                    const requestId = String(reqItem._id || "");
                    const myShare = Number(reqItem.memberShareTotal || 0);
                    const allocationStatus = reqItem.allocationStatus || "Pending";
                    const canAct = !!reqItem.isActionable;
                    const pill = getSplitAllocationPillStyle(allocationStatus);
                    const pillLabel =
                      allocationStatus.toLowerCase() === "pending" && reqItem.isExpired
                        ? "Pending (expired)"
                        : allocationStatus;

                    const memberItems = Array.isArray(reqItem.memberShareItems)
                      ? reqItem.memberShareItems
                      : [];
                    const shownItems = memberItems.slice(0, 4);
                    const remainingItems = memberItems.length - shownItems.length;
                    return (
                      <View key={requestId} style={styles.splitRequestCard}>
                        <View style={styles.splitRequestTopRow}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.splitRequestTitle}>
                              From {reqItem.requester?.name || "Member"}
                            </Text>
                            {!!reqItem.createdAt && (
                              <Text style={styles.splitRequestMeta}>
                                Requested {formatSplitDateTime(reqItem.createdAt)}
                              </Text>
                            )}
                          </View>

                          <View
                            style={[
                              styles.splitStatusPill,
                              { backgroundColor: pill.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.splitStatusPillText,
                                { color: pill.text },
                              ]}
                            >
                              {pillLabel}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.splitRequestSub}>
                          Your share: ₹{myShare.toLocaleString("en-IN")}
                        </Text>

                        {!!memberItems.length && (
                          <View style={styles.splitItemsWrap}>
                            {shownItems.map((it) => (
                              <View
                                key={String(it.snackId)}
                                style={styles.splitItemRow}
                              >
                                <Text style={styles.splitItemLeftText}>
                                  {it.name} x{it.quantity}
                                </Text>
                                <Text style={styles.splitItemRightText}>
                                  ₹{Number(it.total || 0).toLocaleString("en-IN")}
                                </Text>
                              </View>
                            ))}
                            {remainingItems > 0 && (
                              <Text style={styles.splitMoreItemsText}>
                                +{remainingItems} more
                              </Text>
                            )}
                          </View>
                        )}

                        {canAct ? (
                          <View style={styles.splitActionRow}>
                            <TouchableOpacity
                              style={[
                                styles.approveButton,
                                styles.splitApproveActionButton,
                                splitApproveLoadingId === requestId
                                  ? { opacity: 0.7 }
                                  : null,
                              ]}
                              disabled={splitApproveLoadingId === requestId}
                              onPress={() => handleApproveBillSplit(requestId)}
                              activeOpacity={0.9}
                            >
                              {splitApproveLoadingId === requestId ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <View style={styles.approveButtonInner}>
                                  <Ionicons
                                    name="checkmark-circle-outline"
                                    size={18}
                                    color="#FFFFFF"
                                    style={{ marginRight: 8 }}
                                  />
                                  <Text style={styles.approveButtonText}>Approve</Text>
                                </View>
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.rejectButton,
                                styles.splitRejectActionButton,
                                splitRejectLoadingId === requestId
                                  ? { opacity: 0.7 }
                                  : null,
                              ]}
                              disabled={splitRejectLoadingId === requestId}
                              onPress={() => handleRejectBillSplit(requestId)}
                              activeOpacity={0.9}
                            >
                              {splitRejectLoadingId === requestId ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <View style={styles.rejectButtonInner}>
                                  <Ionicons
                                    name="close-circle-outline"
                                    size={18}
                                    color="#FFFFFF"
                                    style={{ marginRight: 8 }}
                                  />
                                  <Text style={styles.rejectButtonText}>Reject</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={styles.splitNonActionText}>
                            {reqItem.isExpired && allocationStatus.toLowerCase() === "pending"
                              ? "Approval window expired"
                              : "Already resolved"}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default MemberDashboard;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTextWrapper: {
    flex: 1,
    marginRight: 16,
  },
  welcomeText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  memberName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  memberMeta: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  statusBadgeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  statusLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginRight: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeActive: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgeInactive: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadgeTextActive: {
    color: "#166534",
  },
  statusBadgeTextInactive: {
    color: "#B91C1C",
  },
  avatarWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderSpacer: {
    flex: 1,
  },
  cardHeaderActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
  },
  cardIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  monthSelectorBlock: {
    marginBottom: 12,
    gap: 8,
  },
  monthSelectorLabel: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 4,
  },
  monthSelectorRow: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  monthPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    marginRight: 10,
  },
  monthPillActive: {
    backgroundColor: "#DCFCE7",
  },
  monthPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  monthPillTextActive: {
    color: "#166534",
  },
  mealPlanType: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  mealTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  mealTagText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  menuValue: {
    fontSize: 14,
    color: "#4B5563",
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  billLabel: {
    fontSize: 14,
    color: "#4B5563",
  },
  billValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  billValueSuccess: {
    fontSize: 15,
    fontWeight: "600",
    color: "#16A34A",
  },
  billValueWarning: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
  },
  billLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 4,
    gap: 8,
  },
  billLoadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  billErrorText: {
    fontSize: 13,
    color: "#DC2626",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 6,
  },
  requestLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  requestPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  requestPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  inactiveText: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 12,
  },
  inactiveCirclesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  inactiveCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveCircleFilled: {
    backgroundColor: "#DCFCE7",
    borderColor: "#16A34A",
  },
  inactiveCircleEmpty: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
  },
  inactiveCircleText: {
    fontSize: 13,
    fontWeight: "800",
  },
  inactiveCircleTextFilled: {
    color: "#166534",
  },
  inactiveCircleTextEmpty: {
    color: "#6B7280",
  },
  activateButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
    gap: 6,
  },
  activateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  extraSnackText: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 12,
  },
  extraSnackButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
    gap: 6,
  },
  extraSnackButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  leaveInfoText: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 12,
  },
  leaveRow: {
    marginBottom: 10,
  },
  leaveLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  leaveInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#F9FAFB",
    fontSize: 14,
  },
  leaveReasonInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  leaveToggleButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
    gap: 6,
  },
  leaveToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  logoutButton: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 999,
    backgroundColor: "#DC2626",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pollOptionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  pollOptionButtonSelected: {
    backgroundColor: "#16A34A",
  },
  pollOptionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  pollOptionTextSelected: {
    color: "#FFFFFF",
  },

  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  notificationBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#DC2626",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
    marginTop: -4,
    marginBottom: 12,
    textAlign: "left",
  },
  modalLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    justifyContent: "center",
  },
  modalBodyText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 10,
  },

  splitRequestCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  splitNotificationsList: {
    paddingBottom: 4,
  },
  splitRequestTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  splitRequestSub: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 8,
  },
  splitRequestTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  splitRequestMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  splitStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  splitStatusPillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  splitItemsWrap: {
    marginTop: 10,
  },
  splitItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  splitItemLeftText: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
  },
  splitItemRightText: {
    marginLeft: 12,
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  splitMoreItemsText: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  splitNonActionText: {
    marginTop: 12,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  splitActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  splitActionButton: {
    flex: 1,
  },
  splitApproveActionButton: {
    flex: 1,
    marginRight: 8,
    marginLeft: 0,
  },
  splitRejectActionButton: {
    flex: 1,
    marginLeft: 8,
    marginRight: 0,
  },
  approveButton: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingVertical: 10,
  },
  approveButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  approveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  rejectButton: {
    backgroundColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 10,
  },

  rejectButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  rejectButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
