import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import api from "../../lib/api";
import { displayMealPlanMr, displayStatusMr } from "../../lib/memberLabelsMr";

const MemberProfile = () => {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const [member, setMember] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated]);

  const fetchMemberProfile = useCallback(async () => {
    if (!user?.id && !user?.email) {
      setProfileLoading(false);
      return;
    }

    try {
      setProfileLoading(true);
      setError(null);

      if (!user?.id) {
        setMember(null);
        return;
      }

      const res = await api.get(`/api/members/${user.id}`);
      setMember(res?.data || null);
    } catch (err) {
      console.error("Fetch member profile error:", err);
      setError(
        err?.response?.data?.message || "Failed to load member profile"
      );
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      fetchMemberProfile();
    }
  }, [loading, isAuthenticated, fetchMemberProfile]);

  if (loading || !isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </View>
    );
  }

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.backButtonPlaceholder} />
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerRightSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ProfileSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const memberName = member?.name || user?.name || "Rahul Patil";
  const rollNumber = member?.rollNumber || "N/A";
  const roomOwnerName = member?.roomOwnerName || user?.roomOwnerName || "N/A";
  const phone = member?.phone || "N/A";
  const email = member?.email || user?.email || "N/A";
  const joiningDate = member?.joiningDate
    ? new Date(member.joiningDate).toLocaleDateString()
    : "N/A";
  const statusEn = member?.status || "N/A";
  const mealPlanEn = member?.mealPlan || "N/A";
  const status = displayStatusMr(language, statusEn, member?.statusMr);
  const mealPlan = displayMealPlanMr(language, mealPlanEn, member?.mealPlanMr);
  const normalizedMealPlan = String(mealPlanEn).trim();
  // Fee is based on meal plan selection:
  // - Both => 3000
  // - Lunch or Dinner => 1500
  const totalMessFeeNumber = (() => {
    if (normalizedMealPlan === "Both") return 3000;
    if (
      normalizedMealPlan === "Lunch" ||
      normalizedMealPlan === "Dinner"
    )
      return 1500;
    if (typeof member?.totalMessFee === "number") return member.totalMessFee;
    return null;
  })();

  const totalMessFee =
    typeof totalMessFeeNumber === "number" ? `₹${totalMessFeeNumber}` : "N/A";

  const dueAmountNumber =
    typeof member?.dueAmount === "number" ? member.dueAmount : null;
  const dueAmount =
    typeof dueAmountNumber === "number" ? `₹${dueAmountNumber}` : "N/A";
  const monthlyDueBills = Array.isArray(member?.monthlyDueBills)
    ? member.monthlyDueBills
    : [];
  const combinedDueMonthsTotalBill = monthlyDueBills.reduce(
    (sum, b) => sum + Number(b?.totalBill || 0),
    0
  );

  const isMembershipActive = String(statusEn).trim() === "Active";
  const membershipBadgeVariant = isMembershipActive ? "active" : "due";

  const mealPlanPillLabel =
    language === "mr"
      ? mealPlan
      : normalizedMealPlan === "Both"
        ? "Lunch & Dinner"
        : mealPlan;

  const dueStatus = (() => {
    if (typeof dueAmountNumber !== "number") return null;
    if (dueAmountNumber > 0) {
      return {
        variant: "due",
        label: language === "mr" ? "बाकी" : "Due",
      };
    }
    return {
      variant: "active",
      label: language === "mr" ? "भुगतान झाले" : "Paid",
    };
  })();

  const paymentProgressRatio = (() => {
    if (typeof totalMessFeeNumber !== "number") return 0;
    if (typeof dueAmountNumber !== "number") return 0;
    const paid = Math.max(0, totalMessFeeNumber - dueAmountNumber);
    const ratio = totalMessFeeNumber > 0 ? paid / totalMessFeeNumber : 0;
    return Math.min(1, Math.max(0, ratio));
  })();

  const percentPaid = Math.round(paymentProgressRatio * 100);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Card>
          <View style={styles.profileHeaderRow}>
            <View style={styles.avatarStack}>
              <AvatarGradient />
              
            </View>

            <View style={styles.profileHeaderTextWrapper}>
              <View style={styles.nameRow}>
                <Text style={styles.memberName}>{memberName}</Text>
                <StatusBadge
                  variant={membershipBadgeVariant}
                  label={status || (isMembershipActive ? "Active" : "Inactive")}
                />
              </View>

              <Text style={styles.memberMeta}>
                {roomOwnerName !== "N/A" ? `Room Owner: ${roomOwnerName}` : ""}
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.sectionSpacer} />

        <Card>
          <SectionHeader
            icon={
              <Ionicons
                name="person-outline"
                size={18}
                color={COLORS.sectionPersonal}
              />
            }
            title="Personal Info"
          />

          <View style={styles.sectionBody}>
            <FieldRow icon="person" label="Name" value={memberName} />
          
            <FieldRow icon="call-outline" label="Phone" value={phone} />
            <FieldRow icon="mail-outline" label="Email" value={email} />
          </View>
        </Card>

        <View style={styles.sectionSpacer} />

        <Card>
          <SectionHeader
            icon={
              <Ionicons
                name="restaurant-outline"
                size={18}
                color={COLORS.sectionMembership}
              />
            }
            title="Membership Info"
          />

          <View style={styles.sectionBody}>
            <FieldRow
              icon="calendar-outline"
              label="Joining Date"
              value={joiningDate}
            />

            <View style={styles.pillRow}>
              <Text style={styles.fieldLabel}>Status</Text>
              <StatusBadge
                variant={membershipBadgeVariant}
                label={status || (isMembershipActive ? "Active" : "Inactive")}
              />
            </View>

            <View style={styles.pillRow}>
              <Text style={styles.fieldLabel}>Meal Plan</Text>
              <PillBadge label={mealPlanPillLabel} />
            </View>
          </View>
        </Card>

        <View style={styles.sectionSpacer} />

        <Card>
          <SectionHeader
            icon={
              <Ionicons
                name="wallet-outline"
                size={18}
                color={COLORS.sectionBilling}
              />
            }
            title="Billing Info"
          />

          <View style={styles.sectionBody}>
            <FieldRow
              icon="wallet-outline"
              label="Total Mess Fee"
              value={totalMessFee}
            />

            <View style={styles.dueRow}>
              <View style={styles.dueRowLeft}>
                <View style={styles.iconCircleSoft}>
                  <Ionicons
                    name="cash-outline"
                    size={16}
                    color={COLORS.sectionBilling}
                  />
                </View>
                <Text style={styles.fieldLabel}>Due Amount</Text>
              </View>

              <View style={styles.dueRowRight}>
                {dueStatus ? (
                  <StatusBadge
                    variant={dueStatus.variant}
                    label={dueStatus.label}
                    small
                  />
                ) : null}
                <Text style={styles.dueValue}>{dueAmount}</Text>
              </View>
            </View>

            <View style={styles.progressBlock}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Payment Status</Text>
                <Text style={styles.progressPercent}>{percentPaid}% Paid</Text>
              </View>
              <ProgressBar ratio={paymentProgressRatio} />
            </View>

            <Divider />

            <View style={styles.pillRow}>
              <Text style={styles.fieldLabel}>
                {language === "mr"
                  ? "एकूण (Due असलेले महिने)"
                  : "Combined (Due months)"}
              </Text>
              <Text style={styles.totalValue}>
                ₹{Number(combinedDueMonthsTotalBill || 0).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.sectionSpacer} />

        <Card>
          <SectionHeader
            icon={
              <Ionicons
                name="time-outline"
                size={18}
                color={COLORS.sectionMonthly}
              />
            }
            title="Monthly Breakdown"
          />

          <View style={styles.sectionBody}>
            {monthlyDueBills.length > 0 ? (
              monthlyDueBills.map((b, idx) => {
                const m = b?.month ? new Date(b.month) : null;
                const monthLabel =
                  m && !Number.isNaN(m.getTime())
                    ? m.toLocaleString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })
                    : `Month ${idx + 1}`;

                const totalBill = Number(b?.totalBill || 0);
                const remaining = Number(b?.remainingAmount || 0);
                const isRemainingDue = remaining > 0;
                const badge = isRemainingDue
                  ? {
                      variant: "due",
                      label: language === "mr" ? "बाकी" : "Due",
                    }
                  : {
                      variant: "active",
                      label: language === "mr" ? "Paid" : "Paid",
                    };

                return (
                  <MonthlyBreakdownItem
                    key={`${String(b?.month || monthLabel)}-${idx}`}
                    monthLabel={monthLabel}
                    totalBill={totalBill}
                    remaining={remaining}
                    badge={badge}
                    language={language}
                  />
                );
              })
            ) : (
              <EmptyState language={language} />
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

export default MemberProfile;

const COLORS = {
  bg: "#F8FAFC", // light neutral background
  card: "#FFFFFF",
  // Brand / accents (multi-color theme)
  indigo: "#4F46E5",
  indigoSoft: "#EEF2FF",
  teal: "#0F766E",
  tealSoft: "#CCFBF1",
  amber: "#D97706",
  amberSoft: "#FEF3C7",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  primaryText: "#0F172A",
  label: "#6B7280",
  divider: "#E5E7EB",
  softAccentBg: "#F3F4F6", // neutral grey for pills / icon circles
  softAccentBgAlt: "#E5E7EB",
  dueRed: "#DC2626",
  dueBg: "#FEE2E2",
  activeAccent: "#166534",
  activeBg: "#DCFCE7",
  shadow: "#000000",

  // Section accents
  sectionPersonal: "#4F46E5",
  sectionMembership: "#0F766E",
  sectionBilling: "#D97706",
  sectionMonthly: "#7C3AED",
};

function Divider() {
  return <View style={styles.divider} />;
}

function StatusBadge({ variant, label, small }) {
  const isActive = variant === "active";
  const isDue = variant === "due";

  return (
    <View
      style={[
        styles.badgeBase,
        small ? styles.badgeSmall : styles.badgeLarge,
        isActive ? styles.badgeActive : styles.badgeDue,
      ]}
    >
      <Text
        style={[
          isActive ? styles.badgeTextActive : styles.badgeTextDue,
          small ? styles.badgeTextSmall : styles.badgeText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function PillBadge({ label }) {
  return (
    <View style={styles.pillBadge}>
      <Text style={styles.pillBadgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Card({ children }) {
  return (
    <View style={styles.card}>
      {children}
    </View>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconCircle}>{icon}</View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FieldRow({ icon, label, value }) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLeft}>
        <View style={styles.iconCircleSoft}>
          <Ionicons name={icon} size={16} color={COLORS.label} />
        </View>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function AvatarGradient() {
  const size = 76;
  const r = size / 2;
  return (
    <View
      style={[
        styles.avatarWrapper,
        { width: size, height: size, borderRadius: r, overflow: "hidden" },
      ]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="avatarGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={COLORS.indigo} stopOpacity="1" />
            <Stop offset="1" stopColor={COLORS.teal} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#avatarGradient)" />
      </Svg>
      <View style={styles.avatarInner}>
        <Ionicons name="person" size={30} color="#FFFFFF" />
      </View>
    </View>
  );
}

function ProgressBar({ ratio }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trackWidth) return;
    const toValue = trackWidth * Math.min(1, Math.max(0, ratio));
    Animated.timing(animatedWidth, {
      toValue,
      duration: 520,
      useNativeDriver: false,
    }).start();
  }, [ratio, trackWidth, animatedWidth]);

  return (
    <View
      style={styles.progressTrack}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[styles.progressFill, { width: animatedWidth }]}
      />
    </View>
  );
}

function MonthlyBreakdownItem({
  monthLabel,
  totalBill,
  remaining,
  badge,
  language,
}) {
  return (
    <View style={styles.monthItem}>
      <View style={styles.monthTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Text style={styles.monthSub}>
            ₹{totalBill.toLocaleString("en-IN")}
            {remaining > 0
              ? language === "mr"
                ? ` • बाकी: ₹${remaining.toLocaleString("en-IN")}`
                : ` • remaining: ₹${remaining.toLocaleString("en-IN")}`
              : ` • Paid`}
          </Text>
        </View>
        <StatusBadge variant={badge.variant} label={badge.label} />
      </View>
    </View>
  );
}

function EmptyState({ language }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="time-outline" size={20} color={COLORS.label} />
      <Text style={styles.emptyStateText}>
        {language === "mr" ? "देय महिने उपलब्ध नाहीत." : "No due months available."}
      </Text>
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View>
      <View style={styles.skelHeaderRow}>
        <View style={[styles.skelAvatar, { backgroundColor: "#E5E7EB" }]} />
        <View style={{ flex: 1, marginLeft: 16 }}>
          <View style={[styles.skelLine, { width: "70%" }]} />
          <View style={[styles.skelLine, { width: "52%", marginTop: 10 }]} />
        </View>
      </View>

      <View style={{ height: 16 }} />

      <SkeletonCard />
      <View style={{ height: 16 }} />
      <SkeletonCard />
      <View style={{ height: 16 }} />
      <SkeletonCard />
      <View style={{ height: 16 }} />
      <SkeletonCard />
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skelHeader}>
        <View
          style={[
            styles.skelIconCircle,
            { backgroundColor: "#E5E7EB" },
          ]}
        />
        <View style={[styles.skelLine, { width: 160, height: 14 }]} />
      </View>
      <View style={styles.skelRows}>
        <View style={styles.skelRow}>
          <View
            style={[
              styles.skelIconMini,
              { backgroundColor: "#E5E7EB" },
            ]}
          />
          <View style={[styles.skelLine, { width: 120 }]} />
        </View>
        <View style={styles.skelRow}>
          <View
            style={[
              styles.skelIconMini,
              { backgroundColor: "#E5E7EB" },
            ]}
          />
          <View style={[styles.skelLine, { width: 90 }]} />
        </View>
        <View style={styles.skelRow}>
          <View
            style={[
              styles.skelIconMini,
              { backgroundColor: "#E5E7EB" },
            ]}
          />
          <View style={[styles.skelLine, { width: 140 }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },

  backButtonPlaceholder: {
    width: 40,
    height: 40,
  },

  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primaryText,
  },

  headerRightSpacer: {
    width: 40,
    height: 40,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },

  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  avatarStack: {
    position: "relative",
  },

  profileHeaderTextWrapper: {
    flex: 1,
    marginLeft: 16,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  memberName: {
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.primaryText,
    marginRight: 10,
  },

  memberMeta: {
    fontSize: 13,
    color: COLORS.label,
    marginTop: 6,
  },

  avatarWrapper: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },

  avatarInner: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },

  avatarEditHint: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  sectionSpacer: {
    height: 16,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  sectionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.softAccentBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.primaryText,
  },

  sectionBody: {
    paddingTop: 2,
  },

  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  fieldLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },

  iconCircleSoft: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.softAccentBgAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.label,
  },

  fieldValue: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primaryText,
    maxWidth: 160,
  },

  pillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 8,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 14,
  },

  pillBadge: {
    backgroundColor: COLORS.softAccentBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "60%",
  },

  pillBadgeText: {
    color: COLORS.primaryText,
    fontSize: 13,
    fontWeight: "900",
  },

  badgeBase: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  badgeLarge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  badgeActive: {
    backgroundColor: COLORS.activeBg,
  },

  badgeDue: {
    backgroundColor: COLORS.dueBg,
  },

  badgeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  badgeTextSmall: {
    fontSize: 11,
    fontWeight: "900",
  },

  badgeTextActive: {
    color: COLORS.activeAccent,
  },

  badgeTextDue: {
    color: COLORS.dueRed,
  },

  dueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },

  dueRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  dueRowRight: {
    alignItems: "flex-end",
  },

  dueValue: {
    fontSize: 16,
    fontWeight: "950",
    color: COLORS.primaryText,
    marginTop: 4,
  },

  progressBlock: {
    marginTop: 12,
    marginBottom: 4,
  },

  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  progressLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.label,
  },

  progressPercent: {
    fontSize: 12,
    fontWeight: "950",
    color: COLORS.teal,
  },

  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.teal,
  },

  totalValue: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.primaryText,
    maxWidth: 140,
  },

  monthItem: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#F9FAFB",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    opacity: 1,
  },

  monthTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  monthLabel: {
    fontSize: 14,
    fontWeight: "950",
    color: COLORS.primaryText,
  },

  monthSub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.label,
  },

  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  errorText: {
    color: COLORS.dueRed,
    fontSize: 13,
    fontWeight: "800",
  },

  emptyState: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyStateText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.label,
    textAlign: "center",
  },

  // Skeleton UI
  skelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  skelAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },

  skelLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },

  skeletonCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },

  skelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  skelIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
  },

  skelRows: {
    paddingTop: 4,
  },

  skelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  skelIconMini: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
});
