import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";

const COLORS = {
  bg: "#F5F7FA",
  card: "#FFFFFF",
  textDark: "#101828",
  textMuted: "#6B7280",
  teal: "#0F8F88",
  border: "#E6EAF0",
  danger: "#B42318",
};

function formatDate(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const MemberPaymentHistory = () => {
  const router = useRouter();
  const { user } = useAuth();
  const memberId = user?.id || user?._id;

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPayments = useCallback(async () => {
    if (!memberId) {
      setPayments([]);
      setLoading(false);
      setError("Member session not found. Please log in again.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await api.get(`/api/payments/${memberId}`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      setPayments(rows);
    } catch (e) {
      console.error("Member payment history fetch error:", e);
      setPayments([]);
      setError("Failed to load payment history.");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const recentPayments = useMemo(() => payments.slice(0, 50), [payments]);

  const renderItem = ({ item }) => {
    const amount = Number(item?.paidAmount || 0);
    const method = String(item?.paymentMethod || "Cash");
    const month = formatDate(item?.month);
    const paidOn = formatDate(item?.date || item?.createdAt || item?.updatedAt);

    return (
      <View style={styles.rowCard}>
        <View style={styles.rowTop}>
          <Text style={styles.amountText}>₹{amount.toLocaleString("en-IN")}</Text>
          <View style={styles.methodBadge}>
            <Text style={styles.methodText}>{method}</Text>
          </View>
        </View>

        <View style={styles.rowBottom}>
          <Text style={styles.metaText}>Billing Month: {month || "-"}</Text>
          <Text style={styles.metaText}>Paid On: {paidOn || "-"}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textDark} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment History</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.teal} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={46} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchPayments} activeOpacity={0.85}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : recentPayments.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="time-outline" size={44} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No payments found yet.</Text>
          </View>
        ) : (
          <FlatList
            data={recentPayments}
            keyExtractor={(item, index) =>
              String(item?._id || item?.id || `${item?.date || "payment"}-${index}`)
            }
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

export default MemberPaymentHistory;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  backButtonPlaceholder: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    paddingBottom: 32,
  },
  rowCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountText: {
    color: COLORS.teal,
    fontWeight: "900",
    fontSize: 22,
  },
  methodBadge: {
    backgroundColor: "#E8F8F7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  methodText: {
    color: COLORS.teal,
    fontSize: 12,
    fontWeight: "700",
  },
  rowBottom: {
    marginTop: 10,
    gap: 4,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  errorText: {
    marginTop: 10,
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 14,
    backgroundColor: COLORS.textDark,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
