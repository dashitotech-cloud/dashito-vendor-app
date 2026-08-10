/**
 * Vendor App — My Drivers Screen
 * Read-only view of this restaurant's own delivery partners (vendor-specific
 * drivers, DeliveryPartner.restaurantId = this restaurant). Adding/editing
 * driver records stays admin-only (apps/admin/src/pages/DeliveryPartners.jsx)
 * — this screen has no add/edit/delete controls anywhere on purpose.
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { api } from "../lib/api";

interface Driver {
  id: string;
  name: string;
  phone: string;
  status: "ONLINE" | "OFFLINE" | "ON_DELIVERY";
  kycStatus: "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";
  vehicleType: string;
  totalDeliveries: number;
  avgRating: number;
}

interface Props { onBack: () => void }

const STATUS_CONFIG: Record<Driver["status"], { label: string; color: string; bg: string }> = {
  ONLINE:      { label: "Online",       color: "#16a34a", bg: "#f0fdf4" },
  ON_DELIVERY: { label: "On Delivery",  color: "#2563eb", bg: "#eff6ff" },
  OFFLINE:     { label: "Offline",      color: "#6b7280", bg: "#f3f4f6" },
};

const KYC_CONFIG: Record<Driver["kycStatus"], { label: string; emoji: string; color: string; bg: string }> = {
  VERIFIED:  { label: "Verified",             emoji: "✅", color: "#16a34a", bg: "#f0fdf4" },
  SUBMITTED: { label: "Submitted — Reviewing", emoji: "⏳", color: "#d97706", bg: "#fffbeb" },
  PENDING:   { label: "Verification Pending", emoji: "⏳", color: "#d97706", bg: "#fffbeb" },
  REJECTED:  { label: "Verification Rejected",emoji: "❌", color: "#dc2626", bg: "#fef2f2" },
};

export function DriversScreen({ onBack }: Props) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDrivers = useCallback(() => {
    return api.get("/vendor/drivers")
      .then(r => setDrivers(r.data.drivers || []))
      .catch(() => setDrivers([]));
  }, []);

  useEffect(() => { fetchDrivers().finally(() => setLoading(false)); }, [fetchDrivers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDrivers().finally(() => setRefreshing(false));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>My Drivers</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {drivers.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛵</Text>
              <Text style={styles.emptyTitle}>No drivers yet</Text>
              <Text style={styles.emptySub}>
                Drivers you've requested are added by the Dashito admin team. Once added and verified, they'll show up here.
              </Text>
            </View>
          ) : (
            drivers.map(d => {
              const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.OFFLINE;
              const kycCfg = KYC_CONFIG[d.kycStatus] || KYC_CONFIG.PENDING;
              return (
                <View key={d.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{d.name}</Text>
                      <Text style={styles.phone}>{d.phone}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
                      <Text style={[styles.badgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                    </View>
                  </View>

                  <View style={styles.cardBottom}>
                    <Text style={styles.meta}>🚲 {d.vehicleType}</Text>
                    <Text style={styles.meta}>📦 {d.totalDeliveries} deliveries</Text>
                    {d.avgRating > 0 && <Text style={styles.meta}>⭐ {Number(d.avgRating).toFixed(1)}</Text>}
                  </View>

                  <View style={[styles.kycBadge, { backgroundColor: kycCfg.bg }]}>
                    <Text style={[styles.kycText, { color: kycCfg.color }]}>{kycCfg.emoji} {kycCfg.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  backIcon: { fontSize: 26, color: "#111827", marginTop: -2 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  emptySub: { fontSize: 13, color: "#9ca3af", textAlign: "center", marginTop: 6, lineHeight: 19 },
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#f3f4f6",
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  name: { fontSize: 15, fontWeight: "700", color: "#111827" },
  phone: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardBottom: { flexDirection: "row", gap: 14, marginTop: 12 },
  meta: { fontSize: 12, color: "#6b7280" },
  kycBadge: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  kycText: { fontSize: 11, fontWeight: "700" },
});
