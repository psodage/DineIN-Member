import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Minus, Plus, UtensilsCrossed } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { formatCurrencyINR } from "../../lib/dateUtils";
import Button from "../../components/ui/Button";
import LoadingOverlay from "../../components/ui/LoadingOverlay";
import Modal from "../../components/ui/Modal";

function getSnackKey(snack) {
  return String(snack?._id || snack?.id || "");
}

function getSnackStock(snack) {
  const raw = snack?.quantity ?? snack?.availableQuantity ?? snack?.stock ?? snack?.inStock;
  const stock = Number(raw);
  if (!Number.isFinite(stock)) return Number.POSITIVE_INFINITY;
  if (snack?.availability === false) return 0;
  return Math.max(0, Math.floor(stock));
}

export default function SnacksTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const memberId = user?.id || user?._id;
  const memberName = user?.name || "";

  const [snacks, setSnacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [placing, setPlacing] = useState(false);
  const [modal, setModal] = useState(null);
  const placingRef = useRef(false);

  const fetchSnacks = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await api.get("/api/snack-products", { params: { available: "true" } });
      let items = Array.isArray(res.data) ? res.data : [];
      items = items.filter((s) => s.availability !== false && getSnackStock(s) >= 1);
      setSnacks(items);
    } catch (err) {
      setModal({ title: "Error", body: err?.response?.data?.message || "Failed to load snacks." });
      setSnacks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSnacks();
  }, [fetchSnacks]);

  const getQty = (id) => Math.max(0, Math.floor(Number(quantities[String(id)] || 0)));

  const updateQty = (id, delta) => {
    const key = String(id);
    setQuantities((prev) => {
      const next = Math.max(0, (prev[key] || 0) + delta);
      return { ...prev, [key]: next };
    });
  };

  const cartItems = snacks.filter((s) => getQty(getSnackKey(s)) > 0);
  const totalItems = cartItems.reduce((sum, s) => sum + getQty(getSnackKey(s)), 0);
  const cartTotal = cartItems.reduce(
    (sum, s) => sum + Number(s.price || 0) * getQty(getSnackKey(s)),
    0
  );

  const placeOrder = async () => {
    if (placingRef.current) return;
    if (!memberId) {
      setModal({ title: "Missing Member", body: "Please log in again." });
      return;
    }

    const orderPayload = snacks
      .map((s) => ({
        snackId: getSnackKey(s),
        quantity: getQty(getSnackKey(s)),
        _stock: getSnackStock(s),
      }))
      .filter((x) => x.quantity >= 1);

    if (!orderPayload.length) {
      setModal({ title: "Validation", body: "Please select at least one snack." });
      return;
    }

    const invalid = orderPayload.find((x) => x.quantity > x._stock);
    if (invalid) {
      const snack = snacks.find((s) => getSnackKey(s) === invalid.snackId);
      setModal({
        title: "Stock Limit",
        body: `${snack?.name || "Snack"} only has ${invalid._stock} available.`,
      });
      return;
    }

    try {
      placingRef.current = true;
      setPlacing(true);
      const orderDate = new Date().toISOString();
      const res = await api.post("/api/snack-orders/bulk-order", {
        studentId: memberId,
        orders: orderPayload.map((x) => ({ snackId: x.snackId, quantity: x.quantity })),
        date: orderDate,
      });

      const { orders, totalAmount } = res?.data || {};
      const rawOrders = Array.isArray(orders) ? orders : [];
      const orderIds = rawOrders
        .map((o) => String(o?.referenceId || o?._id || "").trim())
        .filter(Boolean);

      const params = new URLSearchParams({
        snackName: orderPayload.length === 1 ? snacks.find((s) => getSnackKey(s) === orderPayload[0].snackId)?.name || "Snack" : "Multiple Snacks",
        quantity: String(totalItems),
        totalPrice: String(totalAmount || cartTotal),
        orderId: orderIds.length !== 1 ? "bulk" : orderIds[0],
        orderIds: orderIds.join(","),
        orderDate,
        memberName,
      });
      setQuantities({});
      navigate(`/snacks/success?${params.toString()}`);
    } catch (err) {
      setModal({ title: "Error", body: err?.response?.data?.message || "Failed to place order." });
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white pb-20">
      <div className="safe-top sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-ink">Extra Snacks</h1>
            <p className="text-sm text-muted">Order add-ons for your mess account</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/snacks/history")}
            className="flex items-center gap-1 rounded-xl bg-brand/10 px-3 py-2 text-sm font-bold text-brand"
          >
            <History className="h-4 w-4" />
            History
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        {loading ? (
          <LoadingOverlay visible />
        ) : snacks.length === 0 ? (
          <p className="py-12 text-center text-muted">No snacks available right now.</p>
        ) : (
          snacks.map((item) => {
            const key = getSnackKey(item);
            const qty = getQty(key);
            const stock = getSnackStock(item);
            const canInc = qty < stock;
            return (
              <article key={key} className="rounded-2xl border border-slate-100 bg-surface p-4 animate-fade-in">
                <div className="flex gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <UtensilsCrossed className="h-8 w-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-extrabold text-ink">{item.name}</h3>
                    <p className="text-xs text-muted">Category: {item.category || "Food"}</p>
                    <p className="mt-1 font-bold text-brand">{formatCurrencyINR(item.price)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-full bg-slate-100 p-1">
                        <button type="button" onClick={() => updateQty(key, -1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-[2rem] text-center font-bold">{qty}</span>
                        <button
                          type="button"
                          disabled={!canInc}
                          onClick={() => canInc && updateQty(key, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white disabled:opacity-40"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-muted">
                        Left: {Number.isFinite(stock) ? Math.max(0, stock - qty) : "∞"}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {totalItems > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 px-4">
          <div className="mx-auto max-w-lg rounded-2xl bg-ink p-4 text-white shadow-2xl">
            <div className="flex items-center justify-between text-sm">
              <span>{totalItems} item(s)</span>
              <span className="font-extrabold">{formatCurrencyINR(cartTotal)}</span>
            </div>
            <Button className="mt-3 w-full bg-accent" loading={placing} onClick={placeOrder}>
              Place order
            </Button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => fetchSnacks(true)}
        className="fixed bottom-36 right-4 rounded-full bg-white px-3 py-2 text-xs font-bold text-brand shadow-lg"
      >
        {refreshing ? "…" : "Refresh"}
      </button>

      <Modal open={!!modal} title={modal?.title} onClose={() => setModal(null)}>
        {modal?.body}
      </Modal>
    </div>
  );
}
