import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { api } from "../lib/api";

export type SubScreen =
  | "analytics" | "offers" | "bank" | "documents" | "settings" | "drivers"
  | "subscription" | "agreement" | "notifications" | "commissionCalculator"
  | "content:vendor-policy" | "content:vendor-terms" | "content:vendor-payment-policy";

interface Props {
  onNavigate: (screen: SubScreen) => void;
  onLogout: () => void;
}

const NAV_ITEMS: { key: SubScreen; label: string; emoji: string; desc: string }[] = [
  { key: "notifications", label: "Notifications", emoji: "🔔", desc: "View all your alerts & updates" },
  { key: "analytics",    label: "Analytics",      emoji: "📊", desc: "Revenue & performance overview" },
  { key: "commissionCalculator", label: "Amount Calculator", emoji: "🧮", desc: "Commission & settlement breakdown" },
  { key: "offers",       label: "Offers",          emoji: "🏷️",  desc: "Create and manage promotions" },
  { key: "drivers",      label: "My Drivers",      emoji: "🛵", desc: "View your delivery team" },
  { key: "subscription", label: "Subscription",   emoji: "⭐", desc: "Manage your plan & billing" },
  { key: "bank",         label: "Bank Details",    emoji: "🏦", desc: "Payment settlement account" },
  { key: "documents",    label: "KYC Documents",   emoji: "📄", desc: "Compliance & verification docs" },
  { key: "agreement",    label: "My Agreement",    emoji: "📋", desc: "View signed vendor agreement" },
  { key: "settings",     label: "Settings",        emoji: "⚙️",  desc: "Restaurant profile & preferences" },
];

const POLICY_ITEMS: { key: SubScreen; label: string; emoji: string }[] = [
  { key: "content:vendor-policy",         label: "Vendor Policy",   emoji: "📜" },
  { key: "content:vendor-terms",          label: "Terms & Conditions", emoji: "📝" },
  { key: "content:vendor-payment-policy", label: "Payment Policy",  emoji: "💳" },
];

export function MoreScreen({ onNavigate, onLogout }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [selfDeliver, setSelfDeliver] = useState(false);

  useEffect(() => {
    api.get("/vendor/notifications?page=1").then(r => {
      setUnreadCount(r.data.unread || 0);
    }).catch(() => {});
    api.get("/vendor/profile").then(r => {
      setSelfDeliver(!!r.data.restaurant?.selfDeliver);
    }).catch(() => {});
  }, []);

  const visibleItems = NAV_ITEMS.filter(item => item.key !== "drivers" || selfDeliver);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>More</Text>

      {visibleItems.map(item => (
        <TouchableOpacity key={item.key} style={styles.row} onPress={() => onNavigate(item.key)}>
          <View style={styles.iconWrap}>
            <Text style={styles.emoji}>{item.emoji}</Text>
          </View>
          <View style={styles.textGroup}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
          {item.key === "notifications" && unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}

      <View style={{ height: 28 }} />

      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>🚪  Sign Out</Text>
      </TouchableOpacity>

      {/* Legal & policies */}
      <View style={styles.policySection}>
        <Text style={styles.policySectionTitle}>Legal</Text>
        <View style={styles.policyRow}>
          {POLICY_ITEMS.map((item, i) => (
            <React.Fragment key={item.key}>
              <TouchableOpacity onPress={() => onNavigate(item.key)}>
                <Text style={styles.policyLink}>{item.label}</Text>
              </TouchableOpacity>
              {i < POLICY_ITEMS.length - 1 && <Text style={styles.policySep}>·</Text>}
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.copyright}>© {new Date().getFullYear()} Dashito. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content:   { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 20, marginTop: 8 },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: "#f3f4f6",
  },
  iconWrap:       { width: 44, height: 44, borderRadius: 12, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center", marginRight: 14 },
  emoji:          { fontSize: 22 },
  textGroup:      { flex: 1 },
  label:          { fontSize: 15, fontWeight: "700", color: "#111827" },
  desc:           { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  chevron:        { fontSize: 24, color: "#d1d5db", marginLeft: 8 },
  unreadBadge:    { backgroundColor: "#ef4444", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 },
  unreadBadgeText:{ color: "#fff", fontSize: 11, fontWeight: "800" },
  logoutBtn:      { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: "#fee2e2", alignItems: "center" },
  logoutText:     { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  policySection:      { marginTop: 32, alignItems: "center" },
  policySectionTitle: { fontSize: 11, fontWeight: "700", color: "#d1d5db", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  policyRow:          { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 8 },
  policyLink:         { fontSize: 12, color: "#9ca3af" },
  policySep:          { fontSize: 12, color: "#d1d5db" },
  copyright:          { fontSize: 11, color: "#d1d5db", textAlign: "center" },
});
