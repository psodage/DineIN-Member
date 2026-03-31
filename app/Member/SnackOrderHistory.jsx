import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../../lib/api";
import { useRouter } from "expo-router";

const SnackOrderHistory = () => {
  const router = useRouter();

  const [studentId, setStudentId] = useState(null);
  const [memberName, setMemberName] = useState("");
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getDisplayTotal = (item) => {
    const chargedRaw = item?.chargedAmount;
    const hasChargedAmount = chargedRaw !== null && chargedRaw !== undefined;
    if (hasChargedAmount) {
      const charged = Number(chargedRaw);
      if (Number.isFinite(charged) && charged >= 0) return charged;
    }
    const qty = Number(item?.quantity || 0);
    const price = Number(item?.snackId?.price || 0);
    return qty * price;
  };

  const formatOrderDate = (value) => {
    try {
      const d = value ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (_) {
      return "";
    }
  };

  const displayOrders = useMemo(() => {
    if (!Array.isArray(orderHistory) || orderHistory.length === 0) return [];

    const grouped = [];
    const splitGroups = new Map();

    orderHistory.forEach((order) => {
      const commonOrderId = String(order?.commonOrderId || "").trim();
      const isSplitBill = !!order?.billSplitRequestId && !!commonOrderId;

      if (!isSplitBill) {
        grouped.push(order);
        return;
      }

      const refId = String(order?.purchaseReference || order?._id || "").trim();
      const existing = splitGroups.get(commonOrderId);
      if (!existing) {
        splitGroups.set(commonOrderId, {
          _id: `split-${commonOrderId}`,
          isGroupedSplit: true,
          billSplitRequestId: order?.billSplitRequestId,
          commonOrderId,
          date: order?.date,
          snackNames: [String(order?.snackId?.name || "Snack")],
          quantity: Number(order?.quantity || 0),
          totalPrice: Number(getDisplayTotal(order) || 0),
          orderIds: refId ? [refId] : [],
        });
        return;
      }

      existing.quantity += Number(order?.quantity || 0);
      existing.totalPrice += Number(getDisplayTotal(order) || 0);
      if (order?.date && new Date(order.date) > new Date(existing.date)) {
        existing.date = order.date;
      }
      existing.snackNames.push(String(order?.snackId?.name || "Snack"));
      if (refId) existing.orderIds.push(refId);
    });

    const merged = [...grouped, ...Array.from(splitGroups.values())];
    merged.sort((a, b) => {
      const ad = new Date(a?.date || a?.createdAt || 0).getTime();
      const bd = new Date(b?.date || b?.createdAt || 0).getTime();
      return bd - ad;
    });
    return merged;
  }, [orderHistory]);

  useEffect(() => {
    const loadStudentId = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (!storedUser) return;

        const parsed = JSON.parse(storedUser);
        const id = parsed?._id || parsed?.id || parsed?.memberId;
        if (id) setStudentId(String(id));

        const name =
          parsed?.name ||
          parsed?.fullName ||
          parsed?.studentName ||
          parsed?.email;
        if (name) setMemberName(String(name));
      } catch (e) {
        console.error("Failed to load studentId from storage:", e);
      }
    };

    loadStudentId();
  }, []);

  const fetchOrderHistory = useCallback(async () => {
    if (!studentId) return;
    try {
      setLoading(true);
      setError(null);

      const res = await api.get(`/api/snack-orders/orders/${studentId}`);
      const items = Array.isArray(res.data) ? res.data : [];
      setOrderHistory(items);
    } catch (e) {
      console.error("Failed to fetch snack order history:", e);
      setError(e);
      setOrderHistory([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchOrderHistory();
  }, [fetchOrderHistory]);

  const openOrderReceipt = (item) => {
    const isGroupedSplit = !!item?.isGroupedSplit;
    const qty = Number(item?.quantity || 0);
    const total = isGroupedSplit
      ? Number(item?.totalPrice || 0)
      : getDisplayTotal(item);
    const orderIds = isGroupedSplit
      ? (Array.isArray(item?.orderIds) ? item.orderIds : []).filter(Boolean)
      : [String(item?.purchaseReference || item?._id || "").trim()].filter(Boolean);
    if (orderIds.length === 0) return;
    const refId = orderIds.length === 1 ? orderIds[0] : "";

    const orderDate =
      item?.date != null
        ? new Date(item.date).toISOString()
        : new Date().toISOString();

    const snackName = isGroupedSplit
      ? (() => {
          const names = Array.isArray(item?.snackNames) ? item.snackNames : [];
          if (names.length === 0) return "Split Snack Order";
          if (names.length === 1) return names[0];
          return `${names[0]} +${names.length - 1} more`;
        })()
      : item?.snackId?.name || "Snack";

    router.push({
      pathname: "/Member/SnackPurchaseSuccess",
      params: {
        snackName,
        quantity: String(qty),
        totalPrice: String(total),
        orderId: refId,
        orderIds: JSON.stringify(orderIds),
        orderDate,
        memberName: memberName || "",
        fromHistory: "1",
      },
    });
  };

  const renderRow = ({ item }) => {
    const qty = Number(item?.quantity || 0);
    const total = item?.isGroupedSplit
      ? Number(item?.totalPrice || 0)
      : getDisplayTotal(item);
    const isSplitBill = !!item?.billSplitRequestId;
    const formattedDate = formatOrderDate(item?.date);
    const orderTitle = item?.isGroupedSplit
      ? (() => {
          const names = Array.isArray(item?.snackNames) ? item.snackNames : [];
          if (names.length === 0) return "Split Snack Order";
          if (names.length === 1) return names[0];
          return `${names[0]} +${names.length - 1} more`;
        })()
      : item?.snackId?.name || "Snack";

    return (
      <TouchableOpacity
        style={styles.orderRow}
        activeOpacity={0.75}
        onPress={() => openOrderReceipt(item)}
      >
        <View style={styles.orderRowLeft}>
          <Text style={styles.orderSnackName}>
            {orderTitle}
          </Text>
          <Text style={styles.orderMeta}>
            {formattedDate ? `${formattedDate} • ` : ""}
            Qty: {qty}
            {isSplitBill ? " • Split bill" : ""}
          </Text>
        </View>

        <View style={styles.orderRowRight}>
          <Ionicons name="cash-outline" size={14} color="#065F46" />
          <Text style={styles.orderTotal}>
            ₹{total.toLocaleString("en-IN")}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="#9CA3AF"
            style={styles.rowChevron}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const handleRetry = () => {
    if (!studentId) {
      Alert.alert("Missing member", "Please log in again.");
      return;
    }
    fetchOrderHistory();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Snack Order History</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subtitle}>
           Recent orders:
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={54} color="#F59E0B" />
          <Text style={styles.emptyText}>Failed to load history.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.85}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : displayOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="fast-food-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            Place your first snack order to see history here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayOrders}
          keyExtractor={(item) => String(item?._id)}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

export default SnackOrderHistory;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerRight: {
    width: 40,
  },
  subHeader: {
    marginLeft: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  orderRowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  orderSnackName: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 2,
  },
  orderMeta: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  orderRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowChevron: {
    marginLeft: 2,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: "900",
    color: "#065F46",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#111827",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});

