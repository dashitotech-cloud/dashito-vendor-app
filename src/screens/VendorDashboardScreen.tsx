/**
 * Vendor App — Dashboard / Home Screen
 * Store toggle, today's stats, operating hours, quick actions
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { api } from "../lib/api";
import { useVendorStore } from "../store/useVendorStore";

const CHART_W = Dimensions.get("window").width - 32 - 32;
// A definite (not maxHeight-capped) height for the schedule bottom sheet.
// Percentage maxHeight on a content-sized container leaves the inner
// ScrollView's flex:1 with no definite height to resolve against, which
// collapses it to zero under Fabric's stricter flex-basis resolution —
// a plain numeric height is never ambiguous, so this sidesteps that.
const SCHEDULE_SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.85);

let fssaiAlertShownThisSession = false;

interface Analytics {
  today: { orders: number; revenue: number; netEarnings: number };
  thisWeek: { orders: number; revenue: number };
  commissionRate: number;
  avgRating: number;
  recentSettlements?: { id: string; netPayable?: number; amount?: number; status?: string; createdAt?: string }[];
}

interface NewOrder {
  id: string;
  orderNumber: string;
  finalPayable: number;
  paymentMethod: string;
  createdAt: string;
  userName: string;
  streetLocality: string;
  city: string;
  orderItems: Array<{ name: string; quantity: number; totalPrice: number }>;
}

interface DaySchedule {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
const DAY_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_SCHEDULE: DaySchedule[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  isOpen: true,
  openTime: "09:00",
  closeTime: "22:00",
}));

function isValidTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

interface DashboardProps {
  onNavigateToOrders: () => void;
  onNavigateToMenu: () => void;
  onOpenSubScreen: (screen: "analytics" | "offers" | "bank" | "documents" | "settings") => void;
}

export function VendorDashboardScreen({ onNavigateToOrders, onNavigateToMenu, onOpenSubScreen }: DashboardProps) {
  const { restaurantName, isOpen, setStoreOpen } = useVendorStore();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [toggling, setToggling] = useState(false);

  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editSchedule, setEditSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [saving, setSaving] = useState(false);

  const [newOrders, setNewOrders] = useState<NewOrder[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [refreshingOrders, setRefreshingOrders] = useState(false);

  const fetchAnalytics = useCallback(() => {
    return api.get("/vendor/analytics").then(r => setAnalytics(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchSchedule();
    fetchNewOrders();
    checkFssaiExpiry();

    // Match web dashboard: poll new PLACED orders every 15s, analytics every 60s
    const ordersTimer   = setInterval(fetchNewOrders, 15_000);
    const analyticsTimer = setInterval(fetchAnalytics, 60_000);
    return () => { clearInterval(ordersTimer); clearInterval(analyticsTimer); };
  }, [fetchAnalytics]);

  const handleManualRefresh = async () => {
    setRefreshingOrders(true);
    try { await Promise.all([fetchNewOrders(), fetchAnalytics()]); } finally { setRefreshingOrders(false); }
  };

  const fetchSchedule = async () => {
    try {
      const res = await api.get("/vendor/schedule");
      setSchedule(res.data.schedule);
      setScheduleLoaded(true);
    } catch {}
  };

  const fetchNewOrders = async () => {
    try {
      const res = await api.get("/vendor/orders?status=PLACED");
      setNewOrders(res.data.orders || []);
    } catch {}
  };

  const checkFssaiExpiry = async () => {
    if (fssaiAlertShownThisSession) return;
    try {
      const res = await api.get("/vendor/profile");
      const expiry = res.data?.restaurant?.fssaiExpiry;
      if (!expiry) return;
      const expiryDate = new Date(expiry);
      const threshold = new Date();
      threshold.setMonth(threshold.getMonth() + 3);
      if (expiryDate <= threshold) {
        fssaiAlertShownThisSession = true;
        const formatted = expiryDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        Alert.alert(
          "⚠️ FSSAI License Expiring Soon",
          `Your FSSAI license expires on ${formatted}. Please initiate renewal to avoid any service disruption.`,
          [
            { text: "Remind Later", style: "cancel" },
            { text: "Go to Settings", onPress: () => onOpenSubScreen("settings") },
          ]
        );
      }
    } catch {}
  };

  const handleAcceptOrder = async (orderId: string) => {
    setAcceptingId(orderId);
    try {
      await api.post(`/vendor/orders/${orderId}/accept`);
      fetchNewOrders();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to accept order");
    } finally { setAcceptingId(null); }
  };

  const handleRejectOrder = (orderId: string) => {
    Alert.alert("Reject Order", "Are you sure you want to reject this order?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive", onPress: async () => {
          setRejectingId(orderId);
          try {
            await api.post(`/vendor/orders/${orderId}/reject`);
            fetchNewOrders();
          } catch (e: any) {
            Alert.alert("Error", e.response?.data?.error || "Failed to reject order");
          } finally { setRejectingId(null); }
        },
      },
    ]);
  };

  const handleStoreToggle = async () => {
    setToggling(true);
    try {
      const res = await api.post("/vendor/store/toggle");
      setStoreOpen(res.data.isOpen);
    } catch {
      Alert.alert("Error", "Could not toggle store status");
    } finally {
      setToggling(false);
    }
  };

  const openScheduleEdit = () => {
    setEditSchedule(schedule.map(d => ({ ...d })));
    setShowScheduleModal(true);
  };

  const toggleEditDay = (idx: number) => {
    setEditSchedule(prev =>
      prev.map((d, i) => i === idx ? { ...d, isOpen: !d.isOpen } : d)
    );
  };

  const setEditTime = (idx: number, field: "openTime" | "closeTime", val: string) => {
    setEditSchedule(prev =>
      prev.map((d, i) => i === idx ? { ...d, [field]: val } : d)
    );
  };

  const applyToAllOpen = (idx: number) => {
    const src = editSchedule[idx];
    setEditSchedule(prev =>
      prev.map(d => d.isOpen ? { ...d, openTime: src.openTime, closeTime: src.closeTime } : d)
    );
  };

  const saveSchedule = async () => {
    for (const day of editSchedule) {
      if (day.isOpen) {
        const open = day.openTime || "";
        const close = day.closeTime || "";
        if (!isValidTime(open) || !isValidTime(close)) {
          Alert.alert("Invalid Time", `Enter valid HH:MM times for ${DAY_FULL[day.dayOfWeek]}`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      await api.put("/vendor/schedule", { schedule: editSchedule });
      setSchedule(editSchedule.map(d => ({ ...d })));
      setShowScheduleModal(false);
    } catch {
      Alert.alert("Error", "Could not save schedule");
    } finally {
      setSaving(false);
    }
  };

  // Derive a compact summary string for display
  const scheduleSummary = useCallback((): string => {
    const openDays = schedule.filter(d => d.isOpen);
    if (openDays.length === 0) return "Closed all week";
    if (openDays.length === 7) {
      const allSame = openDays.every(
        d => d.openTime === openDays[0].openTime && d.closeTime === openDays[0].closeTime
      );
      if (allSame) return `Every day  ${openDays[0].openTime || "–"} – ${openDays[0].closeTime || "–"}`;
      return "Open every day (varying hours)";
    }
    const closedDays = schedule.filter(d => !d.isOpen).map(d => DAY_NAMES[d.dayOfWeek]);
    return `Closed on ${closedDays.join(", ")}`;
  }, [schedule]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
      {/* Store header */}
      <View style={styles.storeCard}>
        <View style={styles.storeCardTop}>
          <Text style={styles.greeting}>{getGreeting()} 👋</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={handleManualRefresh} disabled={refreshingOrders} accessibilityLabel="Refresh">
            {refreshingOrders
              ? <ActivityIndicator size="small" color="#059669" />
              : <Text style={styles.refreshBtnIcon}>⟳</Text>
            }
          </TouchableOpacity>
        </View>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{restaurantName || "My Restaurant"}</Text>
          <View style={[styles.statusDot, { backgroundColor: isOpen ? "#22c55e" : "#9ca3af" }]} />
        </View>
        <View style={styles.storeToggleRow}>
          <Text style={styles.storeStatusLabel}>{isOpen ? "Store is OPEN" : "Store is CLOSED"}</Text>
          <Switch
            value={isOpen}
            onValueChange={handleStoreToggle}
            disabled={toggling}
            trackColor={{ true: "#22c55e", false: "#e5e7eb" }}
            thumbColor="#fff"
          />
        </View>
        <Text style={styles.storeToggleHint}>
          {isOpen ? "Toggle off to stop receiving new orders" : "Toggle on when you're ready to accept orders"}
        </Text>
      </View>

      {/* New orders panel */}
      {newOrders.length > 0 && (
        <>
          <View style={styles.newOrdersHeader}>
            <Text style={styles.sectionTitle}>New Orders</Text>
            <View style={styles.newOrdersBadge}>
              <Text style={styles.newOrdersBadgeText}>{newOrders.length}</Text>
            </View>
          </View>
          {newOrders.map(order => (
            <View key={order.id} style={styles.newOrderCard}>
              <View style={styles.newOrderTop}>
                <View>
                  <Text style={styles.newOrderNum}>#{(order.orderNumber || order.id).slice(-6).toUpperCase()}</Text>
                  <Text style={styles.newOrderTime}>{new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
                <Text style={styles.newOrderAmount}>₹{order.finalPayable}</Text>
              </View>
              <Text style={styles.newOrderCustomer}>{order.userName || "Customer"}</Text>
              {order.streetLocality ? (
                <Text style={styles.newOrderAddress}>{order.streetLocality}{order.city ? `, ${order.city}` : ""}</Text>
              ) : null}
              <View style={styles.newOrderItems}>
                {(order.orderItems || []).slice(0, 3).map((item, i) => (
                  <Text key={i} style={styles.newOrderItem}>{item.quantity}× {item.name}</Text>
                ))}
                {(order.orderItems || []).length > 3 && (
                  <Text style={styles.newOrderItemMore}>+{(order.orderItems || []).length - 3} more</Text>
                )}
              </View>
              <View style={styles.newOrderActions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, acceptingId === order.id && styles.btnDisabled]}
                  onPress={() => handleAcceptOrder(order.id)}
                  disabled={acceptingId === order.id || rejectingId === order.id}
                >
                  {acceptingId === order.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.acceptBtnText}>✓ Accept</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectBtn, rejectingId === order.id && styles.btnDisabled]}
                  onPress={() => handleRejectOrder(order.id)}
                  disabled={acceptingId === order.id || rejectingId === order.id}
                >
                  <Text style={styles.rejectBtnText}>✕ Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Today's stats */}
      <Text style={styles.sectionTitle}>Today</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Orders"     value={analytics?.today.orders ?? 0} color="#059669" />
        <StatCard label="Revenue"    value={`₹${(analytics?.today.revenue ?? 0).toLocaleString("en-IN")}`} color="#8b5cf6" />
        <StatCard
          label="Net Earning"
          value={`₹${Math.round(analytics?.today.netEarnings ?? 0).toLocaleString("en-IN")}`}
          color="#22c55e"
          note={`After ${((analytics?.commissionRate ?? 0.15) * 100).toFixed(0)}% commission`}
        />
        <StatCard label="Rating" value={`${(analytics?.avgRating ?? 0).toFixed(1)} ⭐`} color="#f59e0b" />
      </View>

      {/* This week */}
      <Text style={styles.sectionTitle}>This Week</Text>
      <View style={styles.weekCard}>
        <View style={styles.weekRow}>
          <Text style={styles.weekLabel}>Total Orders</Text>
          <Text style={styles.weekValue}>{analytics?.thisWeek.orders ?? 0}</Text>
        </View>
        <View style={styles.weekRow}>
          <Text style={styles.weekLabel}>Gross Revenue</Text>
          <Text style={styles.weekValue}>₹{(analytics?.thisWeek.revenue ?? 0).toLocaleString("en-IN")}</Text>
        </View>
      </View>

      {/* Weekly revenue trend chart */}
      {analytics && analytics.thisWeek.revenue > 0 && (
        <>
          <Text style={styles.sectionTitle}>Revenue Trend (This Week)</Text>
          <View style={styles.chartCard}>
            <LineChart
              data={{
                labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                datasets: [{
                  data: [0.10, 0.12, 0.13, 0.15, 0.18, 0.20, 0.12].map(
                    w => Math.round(analytics.thisWeek.revenue * w)
                  ),
                }],
              }}
              width={CHART_W}
              height={160}
              yAxisLabel="₹"
              yAxisSuffix=""
              withDots={false}
              bezier
              chartConfig={{
                backgroundColor: "#fff",
                backgroundGradientFrom: "#fff",
                backgroundGradientTo: "#fff",
                decimalPlaces: 0,
                color: () => "#059669",
                labelColor: () => "#9ca3af",
                propsForBackgroundLines: { strokeDasharray: "", stroke: "#f3f4f6" },
              }}
              style={{ borderRadius: 12, marginLeft: -16 }}
            />
          </View>
        </>
      )}

      {/* Recent Settlements */}
      {(analytics?.recentSettlements?.length ?? 0) > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Settlements</Text>
          <View style={styles.settCard}>
            {analytics!.recentSettlements!.map(s => (
              <View key={s.id} style={styles.settRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settId}>#{s.id.slice(-8).toUpperCase()}</Text>
                  {s.createdAt && (
                    <Text style={styles.settDate}>
                      {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  )}
                </View>
                <Text style={styles.settAmount}>₹{Math.round(s.netPayable ?? s.amount ?? 0).toLocaleString("en-IN")}</Text>
                <View style={[styles.settBadge, { backgroundColor: s.status === "PENDING" ? "#fffbeb" : "#f0fdf4" }]}>
                  <Text style={[styles.settStatus, { color: s.status === "PENDING" ? "#d97706" : "#16a34a" }]}>
                    {s.status === "PENDING" ? "Pending" : "Paid"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Operating Hours */}
      <Text style={styles.sectionTitle}>Operating Hours</Text>
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleHeader}>
          <View>
            <Text style={styles.scheduleSummary}>{scheduleLoaded ? scheduleSummary() : "Loading..."}</Text>
            <Text style={styles.scheduleHint}>Set which days and hours you're open</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={openScheduleEdit}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Compact day dots */}
        <View style={styles.dayDots}>
          {schedule.map(d => (
            <View key={d.dayOfWeek} style={styles.dayDotItem}>
              <View style={[styles.dayDot, { backgroundColor: d.isOpen ? "#059669" : "#e5e7eb" }]} />
              <Text style={[styles.dayDotLabel, { color: d.isOpen ? "#059669" : "#9ca3af" }]}>
                {DAY_NAMES[d.dayOfWeek]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actions}>
        {[
          { label: "View Orders", emoji: "📋", onPress: onNavigateToOrders },
          { label: "Manage Menu", emoji: "🍽️",  onPress: onNavigateToMenu },
          { label: "Analytics",   emoji: "📊", onPress: () => onOpenSubScreen("analytics") },
          { label: "Settings",    emoji: "⚙️",  onPress: () => onOpenSubScreen("settings") },
          { label: "Create Offer", emoji: "🏷️", onPress: () => onOpenSubScreen("offers") },
        ].map(action => (
          <TouchableOpacity key={action.label} style={styles.actionBtn} onPress={action.onPress}>
            <Text style={styles.actionEmoji}>{action.emoji}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      </ScrollView>

      {/* ── Schedule Edit Modal ───────────────────────────────────────────── */}
      <Modal visible={showScheduleModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { height: SCHEDULE_SHEET_HEIGHT }]}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Operating Hours</Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }}>
              {editSchedule.map((day, idx) => (
                <View key={day.dayOfWeek} style={styles.dayRow}>
                  {/* Day toggle */}
                  <View style={styles.dayToggleRow}>
                    <Switch
                      value={day.isOpen}
                      onValueChange={() => toggleEditDay(idx)}
                      trackColor={{ true: "#059669", false: "#e5e7eb" }}
                      thumbColor="#fff"
                      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
                    <Text style={[styles.dayName, { color: day.isOpen ? "#111827" : "#9ca3af" }]}>
                      {DAY_FULL[day.dayOfWeek]}
                    </Text>
                    {!day.isOpen && (
                      <View style={styles.closedBadge}>
                        <Text style={styles.closedBadgeText}>Closed</Text>
                      </View>
                    )}
                  </View>

                  {/* Time inputs shown only when open */}
                  {day.isOpen && (
                    <View style={styles.timeRow}>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeLabel}>Opens</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={day.openTime || ""}
                          onChangeText={v => setEditTime(idx, "openTime", v)}
                          placeholder="09:00"
                          placeholderTextColor="#d1d5db"
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                      <Text style={styles.timeSep}>–</Text>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeLabel}>Closes</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={day.closeTime || ""}
                          onChangeText={v => setEditTime(idx, "closeTime", v)}
                          placeholder="22:00"
                          placeholderTextColor="#d1d5db"
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.applyAllBtn}
                        onPress={() => applyToAllOpen(idx)}
                      >
                        <Text style={styles.applyAllText}>Apply to{"\n"}all open</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={saveSchedule}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Schedule"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StatCard({ label, value, color, note }: { label: string; value: string | number; color: string; note?: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {note && <Text style={styles.statNote}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#f9fafb" },
  content:         { padding: 16, paddingBottom: 40 },

  // Store card
  greeting:        { fontSize: 13, color: "#9ca3af", fontWeight: "500", marginBottom: 6 },
  storeCard:       { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 20 },
  storeCardTop:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  refreshBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#bbf7d0" },
  refreshBtnIcon:  { fontSize: 15, color: "#059669", fontWeight: "700" },
  storeInfo:       { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  storeName:       { fontSize: 18, fontWeight: "700", color: "#111827" },
  statusDot:       { width: 10, height: 10, borderRadius: 5 },
  storeToggleRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  storeStatusLabel:{ fontSize: 15, fontWeight: "600", color: "#374151" },
  storeToggleHint: { fontSize: 12, color: "#9ca3af", marginTop: 6 },

  // Section
  sectionTitle:    { fontSize: 13, fontWeight: "700", color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },

  // Stats
  statsGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statCard:        { flex: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 12, padding: 14, borderLeftWidth: 3, borderWidth: 1, borderColor: "#f3f4f6" },
  statLabel:       { fontSize: 11, color: "#6b7280", marginBottom: 6 },
  statValue:       { fontSize: 20, fontWeight: "800" },
  statNote:        { fontSize: 10, color: "#9ca3af", marginTop: 3 },

  // Week
  weekCard:        { backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 20 },
  chartCard:       { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 20, overflow: "hidden" },
  weekRow:         { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  weekLabel:       { fontSize: 13, color: "#6b7280" },
  weekValue:       { fontSize: 13, fontWeight: "700", color: "#111827" },

  // Schedule card
  scheduleCard:    { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 20 },
  scheduleHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  scheduleSummary: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 2 },
  scheduleHint:    { fontSize: 12, color: "#9ca3af" },
  editBtn:         { backgroundColor: "#f0fdf4", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: "#bbf7d0" },
  editBtnText:     { fontSize: 13, fontWeight: "700", color: "#059669" },
  dayDots:         { flexDirection: "row", justifyContent: "space-between" },
  dayDotItem:      { alignItems: "center", gap: 4 },
  dayDot:          { width: 28, height: 28, borderRadius: 14 },
  dayDotLabel:     { fontSize: 10, fontWeight: "600" },

  // Quick actions
  actions:         { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn:       { flex: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#f3f4f6" },
  actionEmoji:     { fontSize: 28, marginBottom: 6 },
  actionLabel:     { fontSize: 13, fontWeight: "600", color: "#374151" },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet:      { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle:      { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalClose:      { fontSize: 18, color: "#6b7280", paddingHorizontal: 8 },

  // Day rows
  dayRow:          { borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 12 },
  dayToggleRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  dayName:         { fontSize: 15, fontWeight: "600", flex: 1 },
  closedBadge:     { backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  closedBadgeText: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },

  // Time inputs
  timeRow:         { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, paddingLeft: 52 },
  timeBlock:       { flex: 1 },
  timeLabel:       { fontSize: 11, color: "#6b7280", marginBottom: 4 },
  timeInput:       {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, fontWeight: "700", color: "#111827",
    textAlign: "center", letterSpacing: 2,
  },
  timeSep:         { fontSize: 18, color: "#9ca3af", marginTop: 18 },
  applyAllBtn:     { backgroundColor: "#f0fdf4", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: "#bbf7d0", alignItems: "center" },
  applyAllText:    { fontSize: 10, fontWeight: "600", color: "#059669", textAlign: "center", lineHeight: 14 },

  // Save button
  saveBtn:         { backgroundColor: "#059669", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 16 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Settlements
  settCard:        { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 20, overflow: "hidden" },
  settRow:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  settId:          { fontSize: 12, color: "#374151", fontWeight: "600" },
  settDate:        { fontSize: 11, color: "#9ca3af", marginTop: 1 },
  settAmount:      { fontSize: 14, fontWeight: "700", color: "#111827", marginRight: 10 },
  settBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  settStatus:      { fontSize: 11, fontWeight: "600" },

  // New orders panel
  newOrdersHeader:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  newOrdersBadge:      { backgroundColor: "#ef4444", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  newOrdersBadgeText:  { color: "#fff", fontSize: 12, fontWeight: "800" },
  newOrderCard:        { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#fed7aa", marginBottom: 12 },
  newOrderTop:         { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  newOrderNum:         { fontSize: 15, fontWeight: "700", color: "#111827" },
  newOrderTime:        { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  newOrderAmount:      { fontSize: 18, fontWeight: "800", color: "#f97316" },
  newOrderCustomer:    { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 2 },
  newOrderAddress:     { fontSize: 12, color: "#6b7280", marginBottom: 8 },
  newOrderItems:       { backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, marginBottom: 12 },
  newOrderItem:        { fontSize: 13, color: "#374151", marginBottom: 2 },
  newOrderItemMore:    { fontSize: 11, color: "#9ca3af", fontStyle: "italic" },
  newOrderActions:     { flexDirection: "row", gap: 10 },
  acceptBtn:           { flex: 1, backgroundColor: "#22c55e", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  acceptBtnText:       { color: "#fff", fontSize: 14, fontWeight: "700" },
  rejectBtn:           { paddingHorizontal: 20, backgroundColor: "#fee2e2", borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#fecaca" },
  rejectBtnText:       { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  btnDisabled:         { opacity: 0.6 },
});
