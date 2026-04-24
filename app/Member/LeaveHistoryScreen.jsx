import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";

const PRIMARY = "#0F8F88";
const BG = "#F5F7FA";
const TEXT_DARK = "#0F172A";
const TEXT_MUTE = "#64748B";

function formatDateLabel(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusColor(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "approved") return { bg: "#DCFCE7", text: "#166534" };
  if (status === "rejected") return { bg: "#FEE2E2", text: "#991B1B" };
  return { bg: "#FEF3C7", text: "#92400E" };
}

export default function LeaveHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const memberId = user?.id || user?._id;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (!memberId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get(`/api/leave/self/${memberId}/history?limit=200`);
      setHistory(Array.isArray(res?.data) ? res.data : []);
    } catch (error) {
      console.error("Leave history fetch error:", error);
      setHistory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadHistory(false);
  }, [loadHistory]);

  const renderItem = ({ item }) => {
    const status = statusColor(item?.status);
    const reason = String(item?.reason || item?.reasonMr || "").trim();
    return (
      <View style={styles.rowCard}>
        <View style={styles.rowTop}>
          <Text style={styles.dateRange}>
            {formatDateLabel(item?.startDate)} - {formatDateLabel(item?.endDate)}
          </Text>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={[styles.badgeText, { color: status.text }]}>{item?.status || "Pending"}</Text>
          </View>
        </View>
        <Text style={styles.metaText}>Applied: {formatDateLabel(item?.createdAt)}</Text>
        <Text style={styles.reasonText} numberOfLines={2}>
          {reason || "No reason provided"}
        </Text>
      </View>
    );
  };

  const emptyText = useMemo(
    () => (loading ? "" : "No leave history found yet. Your applied leaves will appear here."),
    [loading]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={18} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leave History</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, index) => String(item?._id || index)}
          renderItem={renderItem}
          contentContainerStyle={history.length ? styles.listContent : styles.emptyContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHistory(true)} tintColor={PRIMARY} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#E7F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: TEXT_DARK, fontSize: 18, fontWeight: "800" },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
  rowCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateRange: { color: TEXT_DARK, fontSize: 13, fontWeight: "700", flex: 1, paddingRight: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  metaText: { marginTop: 6, color: TEXT_MUTE, fontSize: 11, fontWeight: "600" },
  reasonText: { marginTop: 6, color: "#334155", fontSize: 12, fontWeight: "500" },
  emptyContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  emptyText: { color: TEXT_MUTE, textAlign: "center", fontSize: 13, fontWeight: "600" },
});
