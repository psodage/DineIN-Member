import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../../lib/api";

const SnackOrderPage = ({ embedded = false }) => {
  const router = useRouter();

  const [studentId, setStudentId] = useState(null);
  const [memberName, setMemberName] = useState("");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedSplitMemberIds, setSelectedSplitMemberIds] = useState([]);
  const [splitPickerVisible, setSplitPickerVisible] = useState(false);
  const [snacks, setSnacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const placingOrderRef = useRef(false);
  const [quantities, setQuantities] = useState({});

  const getSnackStock = (snack) => {
    // `SnackProduct.quantity` is stock/available units.
    // Some dummy items may not have it; treat missing as unlimited.
    const stock = Number(snack?.quantity);
    if (!Number.isFinite(stock)) return Number.POSITIVE_INFINITY;
    if (snack?.availability === false) return 0;
    return Math.max(0, stock);
  };

  const getSnackAvailableLabel = (snack) => {
    const availability = snack?.availability !== false;
    if (!availability) return "0";
    const stock = Number(snack?.quantity);
    if (!Number.isFinite(stock)) return "Unlimited";
    return String(Math.max(0, stock));
  };

  useEffect(() => {
    const loadStudentId = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const id = parsed?._id || parsed?.id || parsed?.memberId;
          if (id) {
            setStudentId(String(id));
          }
          const name =
            parsed?.name ||
            parsed?.fullName ||
            parsed?.studentName ||
            parsed?.email;
          if (name) {
            setMemberName(String(name));
          }
        }
      } catch (error) {
        console.error("Failed to load studentId from storage:", error);
      }
    };

    loadStudentId();
  }, []);

  const fetchSnacks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/snack-products", {
        params: { available: "true" },
      });

      let items = Array.isArray(res.data) ? res.data : [];
      items = items.filter(
        (s) => s.availability !== false && getSnackStock(s) >= 1
      );

      setSnacks(items);
    } catch (error) {
      console.error("Failed to load snack products:", error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to load snacks."
      );
      setSnacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnacks();
  }, [fetchSnacks]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setMembersLoading(true);
        const res = await api.get("/api/members/split-members");
        setMembers(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error("Failed to load members:", {
          url: error?.config?.url,
          method: error?.config?.method,
          status: error?.response?.status,
          data: error?.response?.data,
          message: error?.message,
        });
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    if (studentId) {
      fetchMembers();
    }
  }, [studentId]);

  const getQuantity = (id) => {
    const key = String(id);
    const raw = quantities[key];
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return 0;
    // Quantity is always an integer in the UI (increment/decrement by 1),
    // but we still guard against any unexpected stored values.
    return Math.floor(n);
  };

  const updateQuantity = (id, delta) => {
    const key = String(id);
    setQuantities((prev) => {
      const current = prev[key] || 0;
      const next = current + delta;
      const clamped = next < 0 ? 0 : Math.floor(next);
      return { ...prev, [key]: clamped };
    });
  };

  const visibleSnacks = snacks.filter(
    (s) => s.availability !== false && getSnackStock(s) >= 1
  );
  const cartItems = visibleSnacks.filter((s) => getQuantity(s._id) > 0);
  const totalItems = cartItems.reduce((sum, s) => sum + getQuantity(s._id), 0);
  const cartTotal = cartItems.reduce(
    (sum, s) => sum + Number(s.price || 0) * getQuantity(s._id),
    0
  );

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const memberOptions = members
    .filter((m) => String(m?._id || m?.id || "").trim() !== "")
    .map((m) => ({
      _id: String(m._id),
      name: m.name,
      rollNumber: m.rollNumber,
    }))
    .filter((m) => (studentId ? String(m._id) !== String(studentId) : true))
    .filter((m) => !selectedSplitMemberIds.includes(String(m._id)))
    .filter((m) => {
      if (!normalizedMemberSearch) return false;
      const name = String(m.name || "").toLowerCase();
      const roll = String(m.rollNumber || "").toLowerCase();
      return (
        name.includes(normalizedMemberSearch) ||
        roll.includes(normalizedMemberSearch)
      );
    })
    .slice(0, 6);

  const getMemberLabel = (mid) => {
    const m = members.find((x) => String(x?._id) === String(mid));
    return String(m?.name || "").trim() || `Member ${mid}`;
  };

  const handleBulkOrder = async () => {
    if (placingOrderRef.current) return;

    if (!studentId) {
      Alert.alert(
        "Missing Member",
        "Unable to find your member account. Please log in again."
      );
      return;
    }

    const orderPayload = snacks
      .map((s) => {
        const quantity = getQuantity(s._id);
        const stock = getSnackStock(s);
        return {
          snackId: s._id,
          quantity,
          _stock: stock,
        };
      })
      .filter((x) => x.quantity >= 1);

    if (orderPayload.length === 0) {
      Alert.alert("Validation", "Please select at least one snack.");
      return;
    }

    // Prevent ordering more than available stock.
    const invalidStock = orderPayload.find((x) => x.quantity > x._stock);
    if (invalidStock) {
      const snack = snacks.find(
        (s) => String(s._id) === String(invalidStock.snackId)
      );
      const name = snack?.name || "Snack";
      const available = invalidStock._stock;
      Alert.alert(
        "Stock Limit",
        `${name} only has ${Number(available) || 0} available. Please reduce quantity.`
      );
      return;
    }

    try {
      placingOrderRef.current = true;
      setIsPlacingOrder(true);

      const orderTotal = cartTotal;
      const orderDate = new Date().toISOString();

      // Split request flow: ask selected members to approve their share.
      if (selectedSplitMemberIds.length > 0) {
        const participantCount = selectedSplitMemberIds.length + 1;

        let snackName = "Multiple Snacks";
        if (orderPayload.length === 1) {
          snackName =
            snacks.find((s) => s._id === orderPayload[0].snackId)?.name ||
            snackName;
        }

        const res = await api.post("/api/bill-splits/request", {
          orderItems: orderPayload.map((x) => ({
            snackId: x.snackId,
            quantity: x.quantity,
          })),
          splitMemberIds: selectedSplitMemberIds,
          date: orderDate,
        });

        setQuantities({});
        setSelectedSplitMemberIds([]);
        setMemberSearch("");

        router.push({
          pathname: "/Member/SnackSplitRequestSuccess",
          params: {
            requestId: String(res?.data?._id || ""),
            totalPrice: String(orderTotal),
            memberCount: String(participantCount),
            orderDate,
            memberName: memberName || "",
            quantity: String(totalItems),
            snackName,
          },
        });

        return;
      }

      // Normal (non-split) flow.
      const res = await api.post("/api/snack-orders/bulk-order", {
        studentId,
        orders: orderPayload.map((x) => ({
          snackId: x.snackId,
          quantity: x.quantity,
        })),
        date: orderDate,
      });

      const { orders, totalAmount } = res?.data || {};
      const rawOrders = Array.isArray(orders) ? orders : [];
      const orderIds = rawOrders
        .map((o) => String(o?.referenceId || o?._id || "").trim())
        .filter(Boolean);
      const finalOrderTotal = totalAmount || orderTotal;
      const useBulk = orderIds.length !== 1;

      let snackName = "Multiple Snacks";
      if (orderPayload.length === 1) {
        snackName = snacks.find((s) => s._id === orderPayload[0].snackId)?.name || snackName;
      }

      // Comma-separated IDs survive URL/query serialization better than JSON.stringify.
      const orderIdsParam = orderIds.join(",");

      router.push({
        pathname: "/Member/SnackPurchaseSuccess",
        params: {
          snackName,
          quantity: String(totalItems),
          totalPrice: String(finalOrderTotal),
          orderId: useBulk ? "bulk" : orderIds[0],
          orderIds: orderIdsParam,
          orderDate,
          memberName: memberName || "",
        },
      });

      setQuantities({});
      // Keep normal (non-split) ordering independent from previous split selections.
      setSelectedSplitMemberIds([]);
      setMemberSearch("");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      console.error("Failed to place snack order:", backendMessage || error);
      Alert.alert(
        "Error",
        backendMessage || "Failed to place snack order."
      );
    } finally {
      placingOrderRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  const renderSnackCard = ({ item }) => {
    const quantity = getQuantity(item._id);
    const price = Number(item.price || 0);
    const maxStock = getSnackStock(item);
    const canIncrease =
      item?.availability !== false && maxStock > 0 && quantity < maxStock;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name="fast-food-outline"
              size={20}
              color="#111827"
              style={styles.cardIcon}
            />
            <View>
              <Text style={styles.snackName}>{item.name}</Text>
              <Text style={styles.snackCategory}>
                Category: {item.category || "Other"}
              </Text>
            </View>
          </View>
          <Text style={styles.snackPrice}>
            ₹{price.toLocaleString("en-IN")}
          </Text>
        </View>

        <View style={styles.availableRow}>
          <Text style={styles.availableLabel}>Available:</Text>
          <Text style={styles.availableValue}>
            {getSnackAvailableLabel(item)}
          </Text>
        </View>

        <View style={styles.quantityRow}>
          <Text style={styles.quantityLabel}>Quantity</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.qtyButton}
              onPress={() => updateQuantity(item._id, -1)}
              activeOpacity={0.7}
            >
              <Ionicons name="remove" size={18} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity
              style={[styles.qtyButton, !canIncrease ? { opacity: 0.45 } : null]}
              onPress={() => {
                if (!canIncrease) return;
                updateQuantity(item._id, 1);
              }}
              activeOpacity={0.7}
              disabled={!canIncrease}
            >
              <Ionicons name="add" size={18} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.totalPill}>
            <Ionicons name="cash-outline" size={16} color="#065F46" />
            <Text style={styles.totalPillText}>
              Total: ₹{(price * quantity).toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {!embedded && (
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.title}>Order Extra Snacks</Text>
          <View style={styles.headerRight} />
        </View>
      )}

      <View style={styles.subHeader}>
        <Text style={styles.subtitle}>
          Select snacks and place your order.
        </Text>
        <TouchableOpacity
          style={styles.historyLink}
          onPress={() => router.push("/Member/SnackOrderHistory")}
          activeOpacity={0.85}
        >
          <Ionicons name="time-outline" size={16} color="#065F46" />
          <Text style={styles.historyLinkText}>Order History</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={visibleSnacks}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderSnackCard}
          extraData={quantities}
          contentContainerStyle={[
            styles.listContent,
            totalItems > 0 && { paddingBottom: 100 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="fast-food-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                No snacks available right now.
              </Text>
            </View>
          }
        />
      )}

      {totalItems > 0 && (
        <View style={styles.floatingCart}>
          <View>
            <Text style={styles.cartTotalText}>
              Total: ₹{cartTotal.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.cartItemsText}>{totalItems} items</Text>

            <TouchableOpacity
              style={styles.splitBillLink}
              onPress={() => setSplitPickerVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color="#D1D5DB"
              />
              <Text style={styles.splitBillLinkText}>
                {selectedSplitMemberIds.length > 0
                  ? `Split with ${selectedSplitMemberIds.length + 1} members`
                  : "Split bill (optional)"}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.placeOrderButton}
            onPress={handleBulkOrder}
            disabled={isPlacingOrder}
            activeOpacity={0.85}
          >
            {isPlacingOrder ? (
              <ActivityIndicator size="small" color="#111827" />
            ) : (
              <Text style={styles.placeOrderButtonText}>Place Order</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={splitPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSplitPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Split Bill</Text>
              <TouchableOpacity
                onPress={() => {
                  setSplitPickerVisible(false);
                  setMemberSearch("");
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Search members and select who should approve their share.
            </Text>

            <View style={styles.memberSearchRow}>
              <Ionicons name="search" size={18} color="#6B7280" />
              <TextInput
                style={styles.memberSearchInput}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder={
                  membersLoading
                    ? "Loading members..."
                    : "Search by name or roll no"
                }
                editable={!membersLoading}
              />
            </View>

            {memberSearch.trim().length > 0 && (
              <View style={styles.memberSuggestionsBox}>
                {memberOptions.length === 0 ? (
                  <Text style={styles.memberSuggestionEmpty}>
                    No members found.
                  </Text>
                ) : (
                  memberOptions.map((m) => (
                    <TouchableOpacity
                      key={m._id}
                      style={styles.memberSuggestionRow}
                      onPress={() => {
                        setSelectedSplitMemberIds((prev) => {
                          if (prev.includes(m._id)) return prev;
                          return [...prev, m._id];
                        });
                        setMemberSearch("");
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberSuggestionName}>
                          {m.name}
                        </Text>
                        {!!m.rollNumber && (
                          <Text style={styles.memberSuggestionMeta}>
                            {m.rollNumber}
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color="#065F46"
                      />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {selectedSplitMemberIds.length > 0 ? (
              <View style={styles.selectedMembersWrap}>
                {selectedSplitMemberIds.map((mid) => (
                  <View key={mid} style={styles.memberChip}>
                    <Text style={styles.memberChipText}>
                      {getMemberLabel(mid)}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setSelectedSplitMemberIds((prev) =>
                          prev.filter((x) => String(x) !== String(mid))
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noSelectedText}>
                No members selected yet.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryModalButton}
                onPress={() => {
                  setSelectedSplitMemberIds([]);
                  setMemberSearch("");
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryModalButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryModalButton}
                onPress={() => setSplitPickerVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryModalButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default SnackOrderPage;

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
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    marginRight: 10,
  },
  snackName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  snackCategory: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  availableRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
 
  },
  availableLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  availableValue: {
    fontSize: 12,
    color: "#065F46",
    fontWeight: "800",
  },
  snackPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  qtyValue: {
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    gap: 6,
  },
  totalPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#065F46",
  },
  orderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
    gap: 6,
  },
  orderButtonDisabled: {
    opacity: 0.7,
  },
  orderButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 80,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  floatingCart: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cartTotalText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cartItemsText: {
    color: "#D1D5DB",
    fontSize: 13,
    marginTop: 2,
  },
  placeOrderButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  placeOrderButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },

  splitBillLink: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  splitBillLinkText: {
    marginTop: -1,
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "700",
  },

  historyLink: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderColor: "#DCFCE7",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  historyLinkText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#065F46",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 12,
  },
  memberSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: "#F9FAFB",
    height: 44,
    marginBottom: 10,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    paddingVertical: 0,
  },
  memberSuggestionsBox: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
    maxHeight: 180,
  },
  memberSuggestionEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#6B7280",
  },
  memberSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memberSuggestionName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  memberSuggestionMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  selectedMembersWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#ECFDF5",
    borderColor: "#DCFCE7",
    borderWidth: 1,
    borderRadius: 999,
    maxWidth: "100%",
  },
  memberChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#065F46",
    maxWidth: 160,
  },
  noSelectedText: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryModalButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryModalButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  primaryModalButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#111827",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryModalButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

