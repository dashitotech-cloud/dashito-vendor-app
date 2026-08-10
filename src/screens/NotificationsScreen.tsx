import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, TextInput,
} from "react-native";
import { api } from "../lib/api";
import { isValidIsoDate } from "../lib/dateValidation";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  referenceId: string | null;
  isRead: boolean;
  sentAt: string;
}

interface Props { onBack: () => void }

const TYPE_LABELS: Record<string, string> = {
  ALL:          "All",
  NEW_ORDER:    "New Orders",
  ORDER_UPDATE: "Order Updates",
  OFFER:        "Offers",
  SETTLEMENT:   "Settlements",
  SUBSCRIPTION: "Subscription",
  SYSTEM:       "System",
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  NEW_ORDER:    { bg: "#fff7ed", text: "#f97316" },
  ORDER_UPDATE: { bg: "#f0fdf4", text: "#16a34a" },
  OFFER:        { bg: "#fef3c7", text: "#d97706" },
  SETTLEMENT:   { bg: "#eff6ff", text: "#2563eb" },
  SUBSCRIPTION: { bg: "#f5f3ff", text: "#7c3aed" },
  SYSTEM:       { bg: "#f3f4f6", text: "#6b7280" },
};

const toISO = (d: Date) => d.toISOString().split("T")[0];
const TODAY     = toISO(new Date());
const YESTERDAY = toISO(new Date(Date.now() - 86_400_000));
const LAST7     = toISO(new Date(Date.now() - 6 * 86_400_000));
const LAST30    = toISO(new Date(Date.now() - 29 * 86_400_000));

const DATE_PRESETS = [
  { label: "Today",     from: TODAY,     to: TODAY     },
  { label: "Yesterday", from: YESTERDAY, to: YESTERDAY },
  { label: "Last 7d",   from: LAST7,     to: TODAY     },
  { label: "Last 30d",  from: LAST30,    to: TODAY     },
];

// A custom range needs both dates to be real calendar dates AND in order —
// isValidIsoDate alone would still accept e.g. "2026-13-45" via a bare
// digit-pattern regex; this also rejects a backwards range (from > to),
// which previously silently produced an empty result with no explanation.
function isValidCustomRange(from: string, to: string): boolean {
  return isValidIsoDate(from) && isValidIsoDate(to) && from <= to;
}

export function NotificationsScreen({ onBack }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [unread, setUnread]     = useState(0);
  const [activeType, setActiveType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [preset, setPreset]     = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

  const fetchNotifications = useCallback(async (pg = 1, replace = true) => {
    if (pg === 1) replace ? setLoading(true) : setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (activeType !== "ALL") params.set("type", activeType);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo)   params.set("dateTo",   dateTo);
      const res = await api.get(`/vendor/notifications?${params}`);
      const data = res.data;
      setNotifications(prev => replace || pg === 1 ? data.notifications : [...prev, ...data.notifications]);
      setTotal(data.total);
      setUnread(data.unread);
      setPage(pg);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [activeType, dateFrom, dateTo]);

  useEffect(() => { fetchNotifications(1, true); }, [fetchNotifications]);

  const markAllRead = async () => {
    await api.patch("/vendor/notifications/read").catch(() => {});
    setUnread(0);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const applyPreset = (p: typeof DATE_PRESETS[0]) => {
    setPreset(p.label);
    setShowCustom(false);
    setDateFrom(p.from);
    setDateTo(p.to);
  };

  const clearDates = () => {
    setPreset(null);
    setShowCustom(false);
    setDateFrom("");
    setDateTo("");
    setCustomFrom("");
    setCustomTo("");
  };

  const applyCustomRange = () => {
    if (!isValidCustomRange(customFrom, customTo)) return;
    setPreset("Custom");
    setDateFrom(customFrom);
    setDateTo(customTo);
  };

  const renderItem = ({ item: n }: { item: Notification }) => {
    const tc = TYPE_COLORS[n.type] || TYPE_COLORS.SYSTEM;
    return (
      <View style={[styles.card, !n.isRead && styles.cardUnread]}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: tc.bg }]}>
            <Text style={[styles.typeBadgeText, { color: tc.text }]}>{TYPE_LABELS[n.type] || n.type}</Text>
          </View>
          {!n.isRead && <View style={styles.unreadDot} />}
          <Text style={styles.timeText}>
            {new Date(n.sentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
        <Text style={styles.titleText}>{n.title}</Text>
        <Text style={styles.bodyText}>{n.body}</Text>
        <Text style={styles.dateText}>
          {new Date(n.sentAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unread}</Text>
            </View>
          )}
        </View>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead} style={styles.markReadBtn}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Type filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeContent}>
        {Object.keys(TYPE_LABELS).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.typeChip, activeType === t && styles.typeChipActive]}
            onPress={() => setActiveType(t)}
          >
            <Text style={[styles.typeChipText, activeType === t && styles.typeChipTextActive]}>
              {TYPE_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Date presets */}
      <View style={styles.dateRow}>
        {DATE_PRESETS.map(p => (
          <TouchableOpacity
            key={p.label}
            style={[styles.presetBtn, preset === p.label && styles.presetBtnActive]}
            onPress={() => applyPreset(p)}
          >
            <Text style={[styles.presetText, preset === p.label && styles.presetTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.presetBtn, preset === "Custom" && styles.presetBtnActive]}
          onPress={() => setShowCustom(v => !v)}
        >
          <Text style={[styles.presetText, preset === "Custom" && styles.presetTextActive]}>📅 Custom</Text>
        </TouchableOpacity>
        {(dateFrom || dateTo) && (
          <TouchableOpacity onPress={clearDates} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕ Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Custom date range entry */}
      {showCustom && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={customFrom}
            onChangeText={setCustomFrom}
            placeholder="From (YYYY-MM-DD)"
            placeholderTextColor="#d1d5db"
            maxLength={10}
          />
          <TextInput
            style={styles.customInput}
            value={customTo}
            onChangeText={setCustomTo}
            placeholder="To (YYYY-MM-DD)"
            placeholderTextColor="#d1d5db"
            maxLength={10}
          />
          <TouchableOpacity
            style={[styles.customApplyBtn, !isValidCustomRange(customFrom, customTo) && styles.customApplyBtnDisabled]}
            onPress={applyCustomRange}
            disabled={!isValidCustomRange(customFrom, customTo)}
          >
            <Text style={styles.customApplyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}
      {showCustom && customFrom && customTo && !isValidCustomRange(customFrom, customTo) && (
        <Text style={styles.customErrorText}>
          {isValidIsoDate(customFrom) && isValidIsoDate(customTo)
            ? "From date must be on or before the To date"
            : "Enter valid dates in YYYY-MM-DD format"}
        </Text>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotifications(1, true)} />}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (notifications.length < total) fetchNotifications(page + 1, false);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>No notifications</Text>
            </View>
          }
          ListFooterComponent={notifications.length > 0 && notifications.length < total ? (
            <ActivityIndicator color="#059669" style={{ marginVertical: 16 }} />
          ) : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#f9fafb" },
  center:        { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },

  header:        { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14 },
  backBtn:       { marginRight: 8, padding: 4 },
  backIcon:      { fontSize: 30, color: "#059669", lineHeight: 34 },
  headerCenter:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle:   { fontSize: 18, fontWeight: "700", color: "#111827" },
  unreadBadge:   { backgroundColor: "#ef4444", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  markReadBtn:   { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#f0fdf4", borderRadius: 8, borderWidth: 1, borderColor: "#bbf7d0" },
  markReadText:  { fontSize: 12, fontWeight: "700", color: "#059669" },

  typeScroll:    { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", maxHeight: 50 },
  typeContent:   { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: "center" },
  typeChip:      { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  typeChipActive: { backgroundColor: "#059669", borderColor: "#059669" },
  typeChipText:  { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  typeChipTextActive: { color: "#fff" },

  dateRow:       { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  presetBtn:     { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  presetBtnActive: { backgroundColor: "#f97316", borderColor: "#f97316" },
  presetText:    { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  presetTextActive: { color: "#fff" },
  clearBtn:      { paddingHorizontal: 8, paddingVertical: 6 },
  clearBtnText:  { fontSize: 12, color: "#9ca3af" },

  customRow:     { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, paddingTop: 0, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  customInput:   { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: "#111827" },
  customApplyBtn:{ backgroundColor: "#f97316", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  customApplyBtnDisabled: { opacity: 0.5 },
  customApplyText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  customErrorText: { fontSize: 11, color: "#ef4444", paddingHorizontal: 16, marginTop: -4, marginBottom: 8 },

  list:          { padding: 12, gap: 10 },
  card:          { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#f3f4f6" },
  cardUnread:    { borderColor: "#d1fae5", borderLeftWidth: 3, borderLeftColor: "#059669" },
  cardHeader:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  typeBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  unreadDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: "#059669" },
  timeText:      { flex: 1, textAlign: "right", fontSize: 11, color: "#9ca3af" },
  titleText:     { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 4 },
  bodyText:      { fontSize: 13, color: "#6b7280", lineHeight: 19 },
  dateText:      { fontSize: 11, color: "#d1d5db", marginTop: 8 },

  emptyIcon:     { fontSize: 40, marginBottom: 8 },
  emptyText:     { fontSize: 14, color: "#9ca3af" },
});
