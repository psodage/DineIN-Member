import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import MemberPollCard from "./MemberPollCard";
import ActivityCalendarScreen from "./ActivityCalendarScreen";
import MemberProfile from "./MemberProfile";
import SnackOrderPage from "./SnackOrderPage";

const MEAL_FALLBACK_TEXT = "Chapati Bhaji Amti Bhat";

/**
 * Format current date like: `Wednesday, August 23, 2023`
 */
function formatCurrentDate(now) {
  try {
    return new Date(now).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Format current time like: `10:10 AM`
 */
function formatCurrentTime(now) {
  try {
    return new Date(now).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function toLocalYMD(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toUTCYMD(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolve menu for a given local date from `@menu` (menu list fetched from `/api/menu`).
 * Backend schema shape (client-side):
 * - { date, lunch, dinner, lunchMr?, dinnerMr? }
 */
function resolveMenuFromAtMenu(menuList, dateLike) {
  // Backend stores `Menu.date` using UTC day boundaries.
  // Normalize the selected date to UTC too so lookups don't break around timezone offsets.
  const key = toUTCYMD(dateLike);
  if (!key) return null;
  if (!Array.isArray(menuList) || menuList.length === 0) return null;

  const found = menuList.find((m) => toUTCYMD(m?.date) === key);
  if (!found) return null;

  return {
    lunch: String(found?.lunch ?? "").trim(),
    dinner: String(found?.dinner ?? "").trim(),
  };
}

function resolveMealText(mealText) {
  const v = String(mealText ?? "").trim();
  if (!v) return MEAL_FALLBACK_TEXT;
  // Be defensive: sometimes APIs serialize missing values as literal strings.
  const lowered = v.toLowerCase();
  if (lowered === "undefined" || lowered === "null" || lowered === "nan") {
    return MEAL_FALLBACK_TEXT;
  }
  return v;
}

const MemberDashboard = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const memberName = user?.name || "Member";
  const restaurantLogoSource = require("../../assets/images/logo2.png");

  const [now, setNow] = useState(() => new Date());
  const todayDate = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now]
  );
  const todayKey = toLocalYMD(todayDate);
  const [selectedDate, setSelectedDate] = useState(() => todayDate);
  const selectedDateKey = toLocalYMD(selectedDate);
  const mealTransitionAnim = useRef(new Animated.Value(1)).current;

  // Live current time (and current date at midnight).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const [menuList, setMenuList] = useState([]);
  const lastMenuFetchAtRef = useRef(0);
  const menuFetchInFlightRef = useRef(false);

  const fetchMenuWithRetry = async (attempt = 0) => {
    // Throttle to avoid hammering the backend (and triggering 429).
    const nowMs = Date.now();
    const THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
    if (menuFetchInFlightRef.current) return;
    if (nowMs - lastMenuFetchAtRef.current < THROTTLE_MS && attempt === 0) return;

    menuFetchInFlightRef.current = true;
    lastMenuFetchAtRef.current = nowMs;

    try {
      const res = await api.get("/api/menu");
      const data = Array.isArray(res?.data) ? res.data : [];
      setMenuList(data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429 && attempt < 4) {
        // Respect Retry-After if provided; otherwise exponential backoff.
        const retryAfterHeader = err?.response?.headers?.["retry-after"];
        const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
        const delayMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : 1000 * Math.pow(2, attempt);

        await new Promise((r) => setTimeout(r, delayMs));
        return fetchMenuWithRetry(attempt + 1);
      }

      console.error("Menu fetch error:", err);
      setMenuList([]);
    } finally {
      menuFetchInFlightRef.current = false;
    }
  };

  useEffect(() => {
    // Fetch menus once; we can look up lunch/dinner for any day from this list.
    fetchMenuWithRetry();
  }, []);

  // If the device date changes (midnight rollover), snap selection back to "today".
  useEffect(() => {
    setSelectedDate(todayDate);
  }, [todayKey, todayDate]);

  // If the selected date doesn't exist in the loaded menu list, refetch (throttled).
  useEffect(() => {
    if (menuList.length === 0) return;
    if (activeMenu) return;
    fetchMenuWithRetry();
  }, [selectedDateKey, activeMenu, menuList.length]);

  const activeMenu = useMemo(
    () => resolveMenuFromAtMenu(menuList, selectedDate),
    [menuList, selectedDate]
  );
  const lunchText = resolveMealText(activeMenu?.lunch);
  const dinnerText = resolveMealText(activeMenu?.dinner);

  // Smooth transition when user taps a different date.
  useEffect(() => {
    mealTransitionAnim.setValue(0);
    Animated.timing(mealTransitionAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [selectedDateKey]);

  const startOfWeek = useMemo(() => {
    // Sunday-first week strip (matches typical mobile dashboards).
    const d = new Date(todayDate);
    const diff = d.getDay(); // Sun=0..Sat=6
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayDate]);

  const weekStrip = useMemo(() => {
    const items = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const key = toLocalYMD(d);
      const weekdayShort = d.toLocaleDateString("en-US", { weekday: "short" });
      items.push({
        key,
        date: d,
        weekdayShort,
        dayOfMonth: d.getDate(),
      });
    }
    return items;
  }, [startOfWeek]);

  const [activeTab, setActiveTab] = useState("home");
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

  const WeekStrip = () => {
    return (
      <View style={styles.weekStripPanel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekStripRow}>
            {weekStrip.map((item, idx) => {
              const isActive = item.key === selectedDateKey;
              return (
                <React.Fragment key={item.key}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedDate(item.date)}
                  >
                    <View
                      style={[
                        styles.weekSquare,
                        isActive && styles.weekSquareActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekSquareWeekday,
                          isActive && styles.weekSquareWeekdayActive,
                        ]}
                      >
                        {item.weekdayShort}
                      </Text>
                      <Text
                        style={[
                          styles.weekSquareDay,
                          isActive && styles.weekSquareDayActive,
                        ]}
                      >
                        {item.dayOfMonth}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {idx !== weekStrip.length - 1 && <View style={styles.weekGap} />}
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  const MealCard = ({ title, accentColor, menuText }) => {
    return (
      <View style={styles.mealCard}>
        <View style={[styles.mealAccentBar, { backgroundColor: accentColor }]} />

        <View style={styles.mealCardInner}>
          <View style={styles.mealCardTopRow}>
            <Text style={styles.mealCardTitle}>{title}</Text>
          </View>

          <Text style={styles.mealCardSubtitle} numberOfLines={2}>
            {menuText}
          </Text>
        </View>
      </View>
    );
  };

  const renderMiddleContent = () => {
    if (activeTab === "leaves") {
      return <ActivityCalendarScreen embedded />;
    }

    if (activeTab === "profile") {
      return <MemberProfile embedded />;
    }

    if (activeTab === "snacks") {
      return <SnackOrderPage embedded />;
    }

    if (activeTab === "bill") {
      return <MemberProfile embedded mode="bill" />;
    }

    return (
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dashboardHeaderRow}>
          <Text style={styles.currentDateText}>
            {formatCurrentDate(now)}
          </Text>
          <Text style={styles.currentTimeText}>
            {formatCurrentTime(now)}
          </Text>
        </View>

        <WeekStrip />

        <View style={styles.sectionCard}>
          <Text style={styles.mealOverviewTitle}>Meal Overview</Text>

          <Animated.View
            style={{
              opacity: mealTransitionAnim,
              transform: [
                {
                  translateY: mealTransitionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [6, 0],
                  }),
                },
              ],
            }}
          >
            <View style={styles.mealCardsColumn}>
              <View style={styles.mealCardOutsideTimes}>
                <Text style={styles.mealOutsideStartTime}>1:30 PM</Text>

                <MealCard
                  title="Lunch"
                  accentColor="#F97316"
                  menuText={lunchText}
                />

                <View style={styles.mealOutsideBottomTimeRow}>
                  <Text style={styles.mealOutsideBottomTimeText}>2:30 PM</Text>
                </View>
              </View>

              <View style={styles.mealCardOutsideTimes}>
                <Text style={styles.mealOutsideStartTime}>7:30 PM</Text>

                <MealCard
                  title="Dinner"
                  accentColor="#8B5CF6"
                  menuText={dinnerText}
                />

                <View style={styles.mealOutsideBottomTimeRow}>
                  <Text style={styles.mealOutsideBottomTimeText}>8:30 PM</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        <View style={styles.pollWrapper}>
          <MemberPollCard />
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <TopHeader />
      <View style={styles.middleArea}>{renderMiddleContent()}</View>
      <BottomNav />
    </View>
  );
};

export default MemberDashboard;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  bodyScroll: {
    flex: 1,
  },
  middleArea: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  sectionCard: {
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 0,
    borderColor: "transparent",
  },
  sectionAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: "#F97316",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 2,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 0,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1F2937",
  },
  sectionHeaderTextWrap: {
    flex: 1,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    marginLeft: 8,
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
  },
  menuList: {
    gap: 12,
  },
  mealItemCard: {
    backgroundColor: "#FFFBF7",
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#FFEDD5",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dashboardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  currentDateText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    flex: 1,
    paddingRight: 12,
  },
  currentTimeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6B7280",
  },
  weekStripOuter: {
    marginBottom: 14,
  },
  weekStripPanel: {
    marginBottom: 14,
    backgroundColor: "#E5E7EB",
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  weekStripRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  weekSquare: {
    height: 54,
    width: 46,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#E5E7EB",
    marginRight: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  weekGap: {
    width: 10,
  },
  weekSquareActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  weekSquareWeekday: {
    fontSize: 11,
    fontWeight: "900",
    color: "#6B7280",
    marginBottom: 3,
  },
  weekSquareWeekdayActive: {
    color: "#6B7280",
  },
  weekSquareDay: {
    fontSize: 15,
    fontWeight: "900",
    color: "#6B7280",
  },
  weekSquareDayActive: {
    color: "#111827",
  },
  mealOverviewTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#1F2937",
    marginBottom: 12,
  },
  pollWrapper: {
    marginTop: 14,
    marginBottom: 14,
  },
  mealCardsColumn: {
    gap: 12,
  },
  mealCard: {
    flexDirection: "row",
    borderRadius: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  mealAccentBar: {
    width: 5,
  },
  mealCardInner: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  mealCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  mealCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
  },
  mealMenuIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  mealCardSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
  },
  mealCardOutsideTimes: {
    gap: 6,
  },
  mealOutsideStartTime: {
    fontSize: 12,
    fontWeight: "900",
    color: "#9CA3AF",
    marginLeft: 12,
  },
  mealOutsideBottomTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 12,
    marginTop: 2,
  },
  mealOutsideBottomTimeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
  },
  mealItemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  mealIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 0,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  menuRowLeft: {
    flex: 1,
    paddingRight: 4,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#9A3412",
  },
  menuValue: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "700",
    lineHeight: 20,
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#FFE7D1",
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

