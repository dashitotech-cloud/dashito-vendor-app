/**
 * Vendor App — Incoming Orders Screen
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows new orders with a countdown timer (must accept within 3 min).
 * Vendor can accept and update prep status: Preparing → Ready.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, RefreshControl, Vibration, ScrollView, Linking,
  Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { io, Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@dashito/shared";
import { api } from "../lib/api";
import { useVendorStore } from "../store/useVendorStore";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: string;
  finalPayable: number;
  specialInstructions: string | null;
  dietaryModeAtOrder: string;
  orderSource?: string;
  userName?: string;
  userPhone?: string;
  user: { name: string; phone: string };
  deliveryAddress: { streetLocality: string; city: string } | null;
  orderItems: Array<{ name: string; quantity: number; totalPrice: number; jainCustomized: boolean }>;
}

interface MenuItem {
  id: string;
  name: string;
  basePrice: number;
}

interface ManualItem {
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
}

const MODE_EMOJI: Record<string, string> = { VEG: "🌿", NON_VEG: "🍗", JAIN: "🙏", HEALTHY: "💪" };
const STATUS_COLORS: Record<string, string> = {
  PLACED:            "#f97316",
  ACCEPTED:          "#3b82f6",
  PREPARING:         "#8b5cf6",
  READY_FOR_PICKUP:  "#22c55e",
  OUT_FOR_DELIVERY:  "#06b6d4",
  DELIVERED:         "#16a34a",
  CANCELLED:         "#9ca3af",
};

type OrderTab = "PLACED" | "ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

const ACCEPT_WINDOW_SECS = 3 * 60; // 3 minutes

function useCountdowns(orders: Order[], activeTab: string) {
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTab !== "PLACED") { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTab]);

  const secsLeft = (order: Order): number => {
    const placed = new Date(order.placedAt || (order as any).createdAt).getTime();
    const elapsed = Math.floor((Date.now() - placed) / 1000);
    return Math.max(0, ACCEPT_WINDOW_SECS - elapsed);
  };

  return { secsLeft, tick };
}

function CountdownBadge({ secs }: { secs: number }) {
  const mins = Math.floor(secs / 60);
  const s    = secs % 60;
  const urgent = secs <= 60;
  return (
    <View style={[cdStyles.badge, { backgroundColor: urgent ? "#fef2f2" : "#fff7ed", borderColor: urgent ? "#fecaca" : "#fed7aa" }]}>
      <Text style={[cdStyles.text, { color: urgent ? "#dc2626" : "#f97316" }]}>
        ⏱ {mins}:{String(s).padStart(2, "0")}
      </Text>
    </View>
  );
}
const cdStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  text:  { fontSize: 13, fontWeight: "700" },
});

function ManualOrderModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName]   = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes]                 = useState("");
  const [menuItems, setMenuItems]         = useState<MenuItem[]>([]);
  const [items, setItems]                 = useState<ManualItem[]>([]);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCustomerName(""); setCustomerPhone(""); setNotes(""); setItems([]);
    api.get("/vendor/menu/items").then(r => {
      setMenuItems(r.data.items || []);
    }).catch(() => {});
  }, [visible]);

  const addItem = (mi: MenuItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.menuItemId === mi.id);
      if (existing) return prev.map(i => i.menuItemId === mi.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { menuItemId: mi.id, name: mi.name, basePrice: mi.basePrice, quantity: 1 }];
    });
  };
  const changeQty = (id: string, delta: number) => setItems(prev =>
    prev.map(i => i.menuItemId === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
  );
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.menuItemId !== id));

  const total = items.reduce((s, i) => s + i.basePrice * i.quantity, 0);

  const handleSubmit = async () => {
    if (!customerName.trim() || !customerPhone.trim()) { Alert.alert("Required", "Customer name and phone are required"); return; }
    if (items.length === 0) { Alert.alert("Required", "Add at least one item"); return; }
    setSaving(true);
    try {
      await api.post("/vendor/orders/manual", {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: items.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        notes: notes.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to create order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={moStyles.container}>
          {/* Header */}
          <View style={moStyles.header}>
            <View>
              <Text style={moStyles.title}>Manual Order</Text>
              <Text style={moStyles.subtitle}>Phone-in / walk-in order</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={saving} style={moStyles.closeBtn}>
              <Text style={moStyles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={moStyles.body} showsVerticalScrollIndicator={false}>
            {/* Customer details */}
            <Text style={moStyles.label}>Customer Name *</Text>
            <TextInput style={moStyles.input} value={customerName} onChangeText={setCustomerName} placeholder="e.g. Rahul Sharma" placeholderTextColor="#d1d5db" />

            <Text style={moStyles.label}>Phone Number *</Text>
            <TextInput style={moStyles.input} value={customerPhone} onChangeText={v => setCustomerPhone(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit number" placeholderTextColor="#d1d5db" keyboardType="phone-pad" maxLength={10} />

            {/* Menu item picker */}
            <Text style={moStyles.label}>Add Items *</Text>
            <ScrollView style={moStyles.menuList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {menuItems.length === 0 ? (
                <ActivityIndicator color="#059669" style={{ marginVertical: 12 }} />
              ) : menuItems.map(mi => (
                <TouchableOpacity key={mi.id} style={moStyles.menuRow} onPress={() => addItem(mi)}>
                  <Text style={moStyles.menuItemName}>{mi.name}</Text>
                  <Text style={moStyles.menuItemPrice}>₹{mi.basePrice} +</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Selected items */}
            {items.length > 0 && (
              <>
                <Text style={moStyles.label}>Order Items</Text>
                {items.map(item => (
                  <View key={item.menuItemId} style={moStyles.itemRow}>
                    <Text style={moStyles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={moStyles.itemPrice}>₹{item.basePrice}</Text>
                    <View style={moStyles.qtyRow}>
                      <TouchableOpacity style={moStyles.qtyBtn} onPress={() => changeQty(item.menuItemId, -1)}>
                        <Text style={moStyles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={moStyles.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity style={moStyles.qtyBtn} onPress={() => changeQty(item.menuItemId, 1)}>
                        <Text style={moStyles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => removeItem(item.menuItemId)} style={{ padding: 4 }}>
                      <Text style={{ color: "#ef4444", fontSize: 14 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={moStyles.totalRow}>
                  <Text style={moStyles.totalLabel}>Total (excl. GST)</Text>
                  <Text style={moStyles.totalAmount}>₹{total.toFixed(0)}</Text>
                </View>
              </>
            )}

            <Text style={moStyles.label}>Notes (optional)</Text>
            <TextInput style={moStyles.input} value={notes} onChangeText={setNotes}
              placeholder="Special instructions…" placeholderTextColor="#d1d5db" multiline />

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={moStyles.footer}>
            <TouchableOpacity style={moStyles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={moStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[moStyles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={moStyles.submitText}>Create Order</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface VendorDriver {
  id: string;
  name: string;
  phone: string;
  status: "ONLINE" | "OFFLINE" | "ON_DELIVERY";
  kycStatus: "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";
  vehicleType: string;
}

const DRIVER_STATUS_LABEL: Record<VendorDriver["status"], string> = {
  ONLINE: "Online", ON_DELIVERY: "On Delivery", OFFLINE: "Offline",
};

function AssignDriverModal({ visible, orderId, drivers, onClose, onAssigned }: {
  visible: boolean; orderId: string | null; drivers: VendorDriver[];
  onClose: () => void; onAssigned: () => void;
}) {
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const handleAssign = async (driver: VendorDriver) => {
    if (!orderId || driver.kycStatus !== "VERIFIED") return;
    setAssigningId(driver.id);
    try {
      const res = await api.post(`/vendor/orders/${orderId}/assign-rider`, { partnerId: driver.id });
      Alert.alert("Sent", res.data?.message || "Assignment offer sent");
      onAssigned();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to assign driver");
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={adStyles.container}>
        <View style={adStyles.header}>
          <Text style={adStyles.title}>Assign Driver</Text>
          <TouchableOpacity onPress={onClose} style={adStyles.closeBtn}>
            <Text style={adStyles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={adStyles.body}>
          {drivers.length === 0 ? (
            <Text style={adStyles.empty}>
              You don't have any drivers yet. Drivers are added by the Dashito admin team once requested.
            </Text>
          ) : (
            drivers.map(d => {
              const verified = d.kycStatus === "VERIFIED";
              const busy = assigningId === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  disabled={!verified || busy}
                  onPress={() => handleAssign(d)}
                  style={[adStyles.driverRow, !verified && adStyles.driverRowDisabled]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={adStyles.driverName}>{d.name}</Text>
                    <Text style={adStyles.driverMeta}>
                      {DRIVER_STATUS_LABEL[d.status]} · {d.vehicleType}
                    </Text>
                    {!verified && (
                      <Text style={adStyles.driverUnverified}>
                        {d.kycStatus === "REJECTED" ? "KYC rejected by admin" : "Awaiting Dashito admin verification"}
                      </Text>
                    )}
                  </View>
                  {busy ? (
                    <ActivityIndicator color="#f97316" />
                  ) : verified ? (
                    <Text style={adStyles.assignLink}>Assign</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
          <Text style={adStyles.hint}>
            The driver gets 30 seconds to accept on their app — if they decline or don't respond, the order stays unassigned and you can pick another driver.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const adStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  closeIcon: { fontSize: 14, color: "#6b7280" },
  body: { padding: 20, paddingBottom: 40 },
  empty: { fontSize: 13, color: "#9ca3af", textAlign: "center", marginTop: 24, lineHeight: 20 },
  driverRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#f9fafb",
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#f3f4f6",
  },
  driverRowDisabled: { opacity: 0.55 },
  driverName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  driverMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  driverUnverified: { fontSize: 11, color: "#d97706", marginTop: 4, fontWeight: "600" },
  assignLink: { fontSize: 13, fontWeight: "700", color: "#f97316" },
  hint: { fontSize: 11, color: "#9ca3af", marginTop: 8, lineHeight: 16 },
});

export function IncomingOrdersScreen() {
  const { accessToken, restaurantId } = useVendorStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderTab>("PLACED");
  const [showManualModal, setShowManualModal] = useState(false);
  const [selfDeliver, setSelfDeliver] = useState(false);
  const [vendorDrivers, setVendorDrivers] = useState<VendorDriver[]>([]);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const { secsLeft } = useCountdowns(orders, activeTab);

  // Only fetched while viewing Ready-for-pickup orders — the only tab where
  // driver assignment is relevant — to avoid extra work on every screen load.
  useEffect(() => {
    if (activeTab !== "READY_FOR_PICKUP") return;
    api.get("/vendor/drivers").then(r => {
      setSelfDeliver(!!r.data.selfDeliver);
      setVendorDrivers(r.data.drivers || []);
    }).catch(() => {});
  }, [activeTab]);

  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await api.get(`/vendor/orders?status=${activeTab}`);
      setOrders(res.data.orders || []);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeTab]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time new order notifications via Socket.io
  useEffect(() => {
    if (!accessToken || !restaurantId) return;
    const socket: Socket = io(
      process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000",
      { auth: { token: accessToken } }
    );

    socket.emit("join:vendor", restaurantId);

    socket.on(SOCKET_EVENTS.NEW_ORDER, () => {
      Vibration.vibrate([0, 300, 100, 300]);
      fetchOrders();
    });

    return () => { socket.disconnect(); };
  }, [accessToken, restaurantId, fetchOrders]);

  const handleAccept = async (orderId: string) => {
    try {
      await api.post(`/vendor/orders/${orderId}/accept`);
      fetchOrders();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to accept");
    }
  };

  const handleReject = (orderId: string) => {
    Alert.alert("Reject Order", "Are you sure you want to reject this order?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive", onPress: async () => {
          try {
            await api.post(`/vendor/orders/${orderId}/reject`);
            fetchOrders();
          } catch (e: any) {
            Alert.alert("Error", e.response?.data?.error || "Failed to reject order");
          }
        },
      },
    ]);
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await api.post(`/vendor/orders/${orderId}/status`, { status: newStatus });
      fetchOrders();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to update");
    }
  };

  const renderOrder = ({ item: order }: { item: Order }) => (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.orderMeta}>
          <Text style={styles.orderNum}>#{order.orderNumber.slice(-8)}</Text>
          <Text style={styles.modeEmoji}>{MODE_EMOJI[order.dietaryModeAtOrder]}</Text>
          {order.orderSource === "MANUAL" && (
            <View style={styles.manualBadge}><Text style={styles.manualBadgeText}>✏ Manual</Text></View>
          )}
        </View>
        {order.status === "PLACED" ? (
          <CountdownBadge secs={secsLeft(order)} />
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + "20" }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
              {order.status.replace(/_/g, " ")}
            </Text>
          </View>
        )}
      </View>

      {/* Customer */}
      <Text style={styles.customerName}>{order.userName || order.user?.name}</Text>
      {(order.userPhone || order.user?.phone) ? (
        <TouchableOpacity onPress={() => Linking.openURL(`tel:+91${order.userPhone || order.user?.phone}`)}>
          <Text style={styles.customerPhone}>📞 +91 {order.userPhone || order.user?.phone}</Text>
        </TouchableOpacity>
      ) : null}
      {order.deliveryAddress ? (
        <Text style={styles.address}>{order.deliveryAddress.streetLocality}, {order.deliveryAddress.city}</Text>
      ) : (
        <Text style={[styles.address, { fontStyle: "italic" }]}>Walk-in / pickup</Text>
      )}

      {/* Items */}
      <View style={styles.itemsContainer}>
        {order.orderItems.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.quantity}×</Text>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.jainCustomized && (
              <View style={styles.jainBadge}><Text style={styles.jainBadgeText}>Jain</Text></View>
            )}
            <Text style={styles.itemPrice}>₹{item.totalPrice}</Text>
          </View>
        ))}
      </View>

      {/* Special instructions */}
      {order.specialInstructions && (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Note:</Text>
          <Text style={styles.noteText}>{order.specialInstructions}</Text>
        </View>
      )}

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>₹{order.finalPayable}</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {order.status === "PLACED" && (
          <View style={styles.placedActions}>
            <TouchableOpacity style={[styles.btn, styles.acceptBtn, { flex: 1 }]} onPress={() => handleAccept(order.id)}>
              <Text style={styles.btnText}>Accept Order</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(order.id)}>
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
        {order.status === "ACCEPTED" && (
          <TouchableOpacity style={[styles.btn, styles.prepBtn]} onPress={() => handleStatusUpdate(order.id, "PREPARING")}>
            <Text style={styles.btnText}>Start Preparing</Text>
          </TouchableOpacity>
        )}
        {order.status === "PREPARING" && (
          <TouchableOpacity style={[styles.btn, styles.readyBtn]} onPress={() => handleStatusUpdate(order.id, "READY_FOR_PICKUP")}>
            <Text style={styles.btnText}>Mark Ready for Pickup</Text>
          </TouchableOpacity>
        )}
        {order.status === "READY_FOR_PICKUP" && (
          selfDeliver ? (
            <TouchableOpacity style={[styles.btn, styles.readyBtn]} onPress={() => setAssigningOrderId(order.id)}>
              <Text style={styles.btnText}>Assign Driver</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.waitingBadge}>
              <Text style={styles.waitingText}>Waiting for delivery partner…</Text>
            </View>
          )
        )}
        {order.status === "OUT_FOR_DELIVERY" && (
          <View style={[styles.waitingBadge, { borderColor: "#a5f3fc", backgroundColor: "#ecfeff" }]}>
            <Text style={[styles.waitingText, { color: "#0891b2" }]}>Out for delivery 🛵</Text>
          </View>
        )}
        {order.status === "DELIVERED" && (
          <View style={[styles.waitingBadge, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }]}>
            <Text style={[styles.waitingText, { color: "#16a34a" }]}>Order delivered ✓</Text>
          </View>
        )}
        {order.status === "CANCELLED" && (
          <View style={[styles.waitingBadge, { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" }]}>
            <Text style={[styles.waitingText, { color: "#9ca3af" }]}>Order cancelled</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ManualOrderModal
        visible={showManualModal}
        onClose={() => setShowManualModal(false)}
        onCreated={() => { fetchOrders(); }}
      />

      <AssignDriverModal
        visible={!!assigningOrderId}
        orderId={assigningOrderId}
        drivers={vendorDrivers}
        onClose={() => setAssigningOrderId(null)}
        onAssigned={() => { setAssigningOrderId(null); fetchOrders(); }}
      />

      {/* Tab bar — scrollable to fit all 7 statuses */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {(["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const).map(tab => {
          const labels: Record<string, string> = {
            PLACED: "New", ACCEPTED: "Accepted", PREPARING: "Preparing",
            READY_FOR_PICKUP: "Ready", OUT_FOR_DELIVERY: "On Way", DELIVERED: "Delivered", CANCELLED: "Cancelled",
          };
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={orders}
        keyExtractor={o => o.id}
        renderItem={renderOrder}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchOrders} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No {activeTab.toLowerCase()} orders</Text>
          </View>
        }
      />

      {/* FAB — Create Manual Order */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowManualModal(true)}>
        <Text style={styles.fabText}>+ Manual Order</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  tabs: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", maxHeight: 46 },
  tabsContent: { paddingHorizontal: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#059669" },
  tabText: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },
  tabTextActive: { color: "#059669", fontWeight: "700" },
  list: { padding: 12, gap: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderNum: { fontSize: 15, fontWeight: "700", color: "#111827" },
  modeEmoji: { fontSize: 18 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: "600" },
  customerName: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 2 },
  customerPhone: { fontSize: 12, color: "#059669", fontWeight: "600", marginBottom: 4 },
  address: { fontSize: 12, color: "#6b7280", marginBottom: 12 },
  itemsContainer: { gap: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemQty: { fontSize: 13, color: "#6b7280", width: 24 },
  itemName: { flex: 1, fontSize: 13, color: "#374151" },
  jainBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  jainBadgeText: { fontSize: 10, color: "#92400e", fontWeight: "600" },
  itemPrice: { fontSize: 13, color: "#111827", fontWeight: "500" },
  noteBox: { flexDirection: "row", gap: 4, backgroundColor: "#fffbeb", borderRadius: 8, padding: 8, marginTop: 10 },
  noteLabel: { fontSize: 12, fontWeight: "600", color: "#92400e" },
  noteText: { flex: 1, fontSize: 12, color: "#78350f" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  totalLabel: { fontSize: 14, fontWeight: "600", color: "#374151" },
  totalAmount: { fontSize: 16, fontWeight: "800", color: "#111827" },
  actions: { marginTop: 12 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  acceptBtn: { backgroundColor: "#22c55e" },
  prepBtn: { backgroundColor: "#8b5cf6" },
  readyBtn: { backgroundColor: "#f97316" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  waitingBadge: { backgroundColor: "#f0fdf4", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#bbf7d0" },
  waitingText: { color: "#16a34a", fontSize: 13, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", paddingTop: 60 },
  emptyText: { color: "#9ca3af", fontSize: 14 },
  placedActions: { flexDirection: "row", gap: 10 },
  rejectBtn: { backgroundColor: "#fee2e2", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", borderWidth: 1, borderColor: "#fecaca" },
  rejectBtnText: { color: "#ef4444", fontSize: 15, fontWeight: "700" },
  manualBadge: { backgroundColor: "#f3e8ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: "#e9d5ff" },
  manualBadgeText: { fontSize: 10, color: "#7c3aed", fontWeight: "700" },
  fab: { position: "absolute", bottom: 20, right: 16, backgroundColor: "#059669", borderRadius: 24, paddingHorizontal: 20, paddingVertical: 13, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

// ─── Manual Order Modal Styles ────────────────────────────────────────────────
const moStyles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#fff" },
  header:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 20, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  title:       { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle:    { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  closeBtn:    { padding: 4 },
  closeIcon:   { fontSize: 18, color: "#9ca3af" },
  body:        { padding: 20, paddingBottom: 20 },
  label:       { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input:       { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#111827" },
  menuList:    { maxHeight: 160, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, marginBottom: 4 },
  menuRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  menuItemName:{ flex: 1, fontSize: 13, color: "#374151", marginRight: 8 },
  menuItemPrice:{ fontSize: 12, fontWeight: "700", color: "#059669" },
  itemRow:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, marginBottom: 6 },
  itemName:    { flex: 1, fontSize: 13, color: "#374151" },
  itemPrice:   { fontSize: 12, color: "#6b7280" },
  qtyRow:      { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyBtn:      { width: 26, height: 26, borderRadius: 8, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  qtyBtnText:  { fontSize: 14, fontWeight: "700", color: "#374151" },
  qtyText:     { fontSize: 14, fontWeight: "700", color: "#111827", minWidth: 20, textAlign: "center" },
  totalRow:    { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  totalLabel:  { fontSize: 13, color: "#6b7280" },
  totalAmount: { fontSize: 15, fontWeight: "800", color: "#111827" },
  footer:      { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  cancelBtn:   { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelText:  { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  submitBtn:   { flex: 2, backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitText:  { color: "#fff", fontSize: 15, fontWeight: "700" },
});
