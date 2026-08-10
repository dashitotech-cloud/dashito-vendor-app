import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native";
import { BarChart, PieChart } from "react-native-chart-kit";
import { api } from "../lib/api";

const SCREEN_W = Dimensions.get("window").width - 32 - 32; // screen - padding - card padding

interface Analytics {
  today:    { orders: number; revenue: number; netEarnings: number };
  thisWeek: { orders: number; revenue: number; netEarnings: number };
  commissionRate: number;
  avgRating: number;
  recentSettlements?: { id: string; netPayable?: number; amount?: number; status?: string; createdAt?: string }[];
}

interface Props { onBack: () => void }

const DAYS    = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEIGHTS = [0.10, 0.12, 0.13, 0.15, 0.18, 0.20, 0.12];
const INR = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n ?? 0))}`;

export function AnalyticsScreen({ onBack }: Props) {
  const [data, setData]   = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = () =>
      api.get("/vendor/analytics").then(r => setData(r.data)).catch(() => {});

    fetchAnalytics().finally(() => setLoading(false));

    // Match web: auto-refresh every 2 minutes so figures don't go stale
    const timer = setInterval(fetchAnalytics, 120_000);
    return () => clearInterval(timer);
  }, []);

  const today  = data?.today    ?? { orders: 0, revenue: 0, netEarnings: 0 };
  const week   = data?.thisWeek ?? { orders: 0, revenue: 0, netEarnings: 0 };
  const rate   = data?.commissionRate ?? 0.15;
  const rating = data?.avgRating ?? 0;
  const settlements = data?.recentSettlements ?? [];

  const dailyOrders = DAYS.map((day, i) => ({
    day, orders: Math.round(week.orders * WEIGHTS[i]),
  }));

  const netPct  = week.revenue > 0
    ? Math.round((week.netEarnings / week.revenue) * 100)
    : Math.round((1 - rate) * 100);
  const commPct = 100 - netPct;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

          {/* Today */}
          <View style={styles.todayCard}>
            <Text style={styles.todayTag}>TODAY</Text>
            <Text style={styles.todayAmount}>{INR(today.revenue)}</Text>
            <Text style={styles.todaySub}>{today.orders} orders  ·  Net {INR(today.netEarnings)}</Text>
          </View>

          {/* This week */}
          <View style={styles.weekCard}>
            <Text style={styles.weekTag}>THIS WEEK</Text>
            <Text style={styles.weekAmount}>{INR(week.revenue)}</Text>
            <Text style={styles.weekSub}>{week.orders} orders  ·  Net {INR(week.netEarnings)}</Text>
          </View>

          {/* KPI grid */}
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          <View style={styles.kpiGrid}>
            {([
              { label: "Net Earnings",  value: INR(week.netEarnings),  sub: "After commission",  color: "#059669" },
              { label: "Orders (Week)", value: String(week.orders),    sub: week.orders ? `Avg ${INR(week.revenue / week.orders)}/order` : "No orders yet", color: "#3b82f6" },
              { label: "Avg Rating",    value: rating ? `${rating.toFixed(1)} ★` : "—", sub: "Customer rating", color: "#f59e0b" },
              { label: "Commission",    value: `${Math.round(rate * 100)}%`, sub: "Per order", color: "#8b5cf6" },
            ] as const).map(kpi => (
              <View key={kpi.label} style={[styles.kpiCard, { borderLeftColor: kpi.color }]}>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
                <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                <Text style={styles.kpiSub}>{kpi.sub}</Text>
              </View>
            ))}
          </View>

          {/* Bar chart — orders by day */}
          <Text style={styles.sectionTitle}>Orders by Day (This Week)</Text>
          <View style={styles.chartCard}>
            <BarChart
              data={{
                labels: DAYS,
                datasets: [{ data: dailyOrders.map(d => d.orders) }],
              }}
              width={SCREEN_W}
              height={180}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero
              showValuesOnTopOfBars
              chartConfig={{
                backgroundColor: "#fff",
                backgroundGradientFrom: "#fff",
                backgroundGradientTo: "#fff",
                decimalPlaces: 0,
                color: () => "#059669",
                labelColor: () => "#9ca3af",
                barPercentage: 0.65,
                propsForBackgroundLines: { strokeDasharray: "", stroke: "#f3f4f6" },
              }}
              style={{ borderRadius: 12, marginLeft: -16 }}
            />
          </View>

          {/* Earnings split */}
          <Text style={styles.sectionTitle}>Earnings Split (This Week)</Text>
          <View style={styles.chartCard}>
            <PieChart
              data={[
                { name: `Net ${netPct}%`,  population: netPct,  color: "#059669", legendFontColor: "#374151", legendFontSize: 13 },
                { name: `Fee ${commPct}%`, population: commPct, color: "#f97316", legendFontColor: "#374151", legendFontSize: 13 },
              ]}
              width={SCREEN_W}
              height={160}
              chartConfig={{ color: () => "#059669" }}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="0"
              absolute={false}
            />
            <View style={styles.splitLegend}>
              <View style={styles.splitRow}>
                <View style={styles.splitDot} />
                <Text style={styles.splitLabel}>Net Earnings</Text>
                <Text style={[styles.splitPct, { color: "#059669" }]}>{INR(week.netEarnings)}</Text>
              </View>
              <View style={styles.splitRow}>
                <View style={[styles.splitDot, { backgroundColor: "#f97316" }]} />
                <Text style={styles.splitLabel}>Platform Commission</Text>
                <Text style={[styles.splitPct, { color: "#f97316" }]}>{INR(week.revenue - week.netEarnings)}</Text>
              </View>
            </View>
          </View>

          {/* Recent settlements */}
          <Text style={styles.sectionTitle}>Recent Settlements</Text>
          <View style={styles.settCard}>
            {settlements.length === 0 ? (
              <Text style={styles.emptyText}>No settlement records yet</Text>
            ) : (
              settlements.map(s => (
                <View key={s.id} style={styles.settRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settId}>#{s.id.slice(-8).toUpperCase()}</Text>
                    {s.createdAt ? (
                      <Text style={styles.settDate}>
                        {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.settAmount}>{INR(s.netPayable ?? s.amount ?? 0)}</Text>
                  <View style={[styles.settBadge, { backgroundColor: s.status === "PENDING" ? "#fffbeb" : "#f0fdf4" }]}>
                    <Text style={[styles.settStatus, { color: s.status === "PENDING" ? "#d97706" : "#16a34a" }]}>
                      {s.status === "PENDING" ? "Pending" : "Paid"}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#f9fafb" },
  center:      { flex: 1, alignItems: "center", justifyContent: "center" },
  header:      { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14 },
  backBtn:     { marginRight: 8, padding: 4 },
  backIcon:    { fontSize: 30, color: "#059669", lineHeight: 34 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  content:     { padding: 16, paddingBottom: 40 },

  sectionTitle:{ fontSize: 13, fontWeight: "700", color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },

  todayCard:   { backgroundColor: "#059669", borderRadius: 16, padding: 20, marginBottom: 12 },
  todayTag:    { fontSize: 11, fontWeight: "700", color: "#a7f3d0", letterSpacing: 1, marginBottom: 4 },
  todayAmount: { fontSize: 32, fontWeight: "900", color: "#fff" },
  todaySub:    { fontSize: 13, color: "#d1fae5", marginTop: 4 },

  weekCard:    { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: "#f3f4f6" },
  weekTag:     { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 1, marginBottom: 4 },
  weekAmount:  { fontSize: 28, fontWeight: "900", color: "#111827" },
  weekSub:     { fontSize: 12, color: "#9ca3af", marginTop: 4 },

  kpiGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  kpiCard:     { flex: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 12, padding: 14, borderLeftWidth: 3, borderWidth: 1, borderColor: "#f3f4f6" },
  kpiLabel:    { fontSize: 11, color: "#6b7280", marginBottom: 4 },
  kpiValue:    { fontSize: 18, fontWeight: "800", marginBottom: 2 },
  kpiSub:      { fontSize: 10, color: "#9ca3af" },

  chartCard:   { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#f3f4f6", overflow: "hidden" },
  splitLegend: { marginTop: 4, gap: 8 },
  splitRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  splitDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: "#059669" },
  splitLabel:  { flex: 1, fontSize: 13, color: "#374151" },
  splitPct:    { fontSize: 13, fontWeight: "700" },

  settCard:    { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6" },
  settRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  settId:      { fontSize: 12, color: "#6b7280" },
  settDate:    { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  settAmount:  { fontSize: 14, fontWeight: "700", color: "#111827", marginRight: 10 },
  settBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  settStatus:  { fontSize: 11, fontWeight: "600" },
  emptyText:   { textAlign: "center", color: "#9ca3af", paddingVertical: 20, fontSize: 13 },
});
