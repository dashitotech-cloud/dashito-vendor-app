/**
 * Global "new order" alert — mounted once at the app root (src/App.tsx) so
 * it's live on every screen, not just Orders. Mirrors
 * apps/admin/src/components/NewOrderAlert.jsx: joins this vendor's socket.io
 * room, queues incoming order ids, and shows one popup at a time with
 * Accept/Reject. Sound comes from the phone's own notification channel
 * (already configured in usePushNotifications.ts) via a local
 * expo-notifications alert — no bundled audio asset needed.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { io, Socket } from "socket.io-client";
import * as Notifications from "expo-notifications";
import { SOCKET_EVENTS } from "@dashito/shared";
import { api } from "../lib/api";
import { useVendorStore } from "../store/useVendorStore";

interface OrderItem { name: string; quantity: number; totalPrice: number }
interface Order {
  id: string; orderNumber: string; finalPayable: number;
  userName?: string; userPhone?: string;
  user?: { name: string; phone: string };
  deliveryAddress?: { streetLocality: string; city: string } | null;
  orderItems: OrderItem[];
}

const INR = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n ?? 0))}`;

export function NewOrderAlert() {
  const { accessToken, restaurantId } = useVendorStore();
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken || !restaurantId) return;
    const socket: Socket = io(process.env.EXPO_PUBLIC_API_URL || "https://api.dashito.in", {
      auth: { token: accessToken },
    });
    socketRef.current = socket;

    socket.emit("join:vendor", restaurantId);

    socket.on(SOCKET_EVENTS.NEW_ORDER, (payload: { orderId?: string }) => {
      if (!payload?.orderId) return;
      setQueue(prev => prev.includes(payload.orderId!) ? prev : [...prev, payload.orderId!]);
      Notifications.scheduleNotificationAsync({
        content: { title: "New Order!", body: "You have a new incoming order.", data: { type: "NEW_ORDER" }, sound: "default" },
        trigger: null,
      }).catch(() => {});
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [accessToken, restaurantId]);

  useEffect(() => {
    if (current || loadingOrder || queue.length === 0) return;
    const [nextId, ...rest] = queue;
    setLoadingOrder(true);
    api.get("/vendor/orders?status=PLACED")
      .then(res => {
        const found = (res.data?.orders || []).find((o: Order) => o.id === nextId);
        if (found) setCurrent(found);
      })
      .catch(() => {})
      .finally(() => { setQueue(rest); setLoadingOrder(false); });
  }, [queue, current, loadingOrder]);

  const orderLabel = useCallback((order: Order) => `#${order.orderNumber?.slice(-8).toUpperCase()}`, []);

  const handleAccept = async () => {
    if (!current) return;
    setActionLoading(true);
    try {
      await api.post(`/vendor/orders/${current.id}/accept`);
      setCurrent(null);
    } catch {
      setCurrent(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!current) return;
    setActionLoading(true);
    try {
      await api.post(`/vendor/orders/${current.id}/reject`);
      setCurrent(null);
    } catch {
      setCurrent(null);
    } finally {
      setActionLoading(false);
    }
  };

  // Hides the popup only — the order stays PLACED and remains visible/
  // actionable on the Orders screen, matching web's dismiss behavior.
  const handleDismiss = () => setCurrent(null);

  if (!current) return null;

  const custName  = current.userName || current.user?.name;
  const custPhone = current.userPhone || current.user?.phone;
  const address   = current.deliveryAddress;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.headerText}>🛍️ New Order!</Text>
          <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 4 }}>
          <Text style={styles.orderNumber}>{orderLabel(current)}</Text>

          {(custName || custPhone) && (
            <View style={{ marginBottom: 10 }}>
              {custName && <Text style={styles.custName}>{custName}</Text>}
              {custPhone && <Text style={styles.custMeta}>📞 {custPhone}</Text>}
              {address && (address.streetLocality || address.city) && (
                <Text style={styles.custMeta} numberOfLines={2}>📍 {[address.streetLocality, address.city].filter(Boolean).join(", ")}</Text>
              )}
            </View>
          )}

          <View style={styles.itemsBox}>
            {(current.orderItems || []).map((it, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>{it.name} ×{it.quantity}</Text>
                <Text style={styles.itemPrice}>{INR(it.totalPrice)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{INR(current.finalPayable)}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} disabled={actionLoading}>
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.acceptText}>Accept</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", zIndex: 999 },
  sheet:   { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", overflow: "hidden" },
  header:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#f97316" },
  headerText: { fontSize: 14, fontWeight: "800", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
  closeIcon:  { fontSize: 16, color: "rgba(255,255,255,0.85)" },
  body:    { paddingHorizontal: 20, paddingTop: 16 },
  orderNumber: { fontSize: 20, fontWeight: "900", color: "#111827", marginBottom: 8 },
  custName: { fontSize: 14, fontWeight: "700", color: "#374151" },
  custMeta: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  itemsBox: { borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 10, gap: 6 },
  itemRow:  { flexDirection: "row", justifyContent: "space-between" },
  itemName: { flex: 1, fontSize: 13, color: "#374151", marginRight: 10 },
  itemPrice:{ fontSize: 13, color: "#6b7280" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#f3f4f6", marginTop: 12, paddingTop: 12 },
  totalLabel: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
  totalValue: { fontSize: 20, fontWeight: "900", color: "#111827" },
  footer:  { flexDirection: "row", gap: 12, padding: 16 },
  rejectBtn: { flex: 1, backgroundColor: "#fef2f2", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  rejectText:{ fontSize: 14, fontWeight: "800", color: "#dc2626" },
  acceptBtn: { flex: 1, backgroundColor: "#059669", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  acceptText:{ fontSize: 14, fontWeight: "800", color: "#fff" },
});
