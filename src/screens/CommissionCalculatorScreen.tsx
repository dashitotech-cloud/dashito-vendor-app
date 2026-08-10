import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { api } from "../lib/api";

interface FeeSetting { type: "value" | "percentage"; amount: number }
interface OrderItemRow { name: string; quantity: number; basePrice: number; dashitoPrice: number; totalPrice: number }
interface OrderRow {
  id: string; orderNumber: string; deliveredAt: string | null; items: OrderItemRow[];
  dashitoPrice: number; commissionAmount: number; paymentGatewayChargeAmount: number; vendorPayout: number;
  settlement: { status: string; utrNumber: string | null; paidAt: string | null };
}
interface CalculatorData {
  commissionRate: number;
  paymentGatewayChargeSetting: FeeSetting;
  totals: { dashitoPrice: number; commissionAmount: number; paymentGatewayChargeAmount: number; vendorPayout: number };
  orders: OrderRow[];
}

interface Props { onBack: () => void }

const INR = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n ?? 0))}`;
const settingLabel = (s?: FeeSetting) => !s ? "—" : (s.type === "percentage" ? `${s.amount}%` : INR(s.amount));
const capOrInfinity = (v: string) => { const n = parseFloat(v); return n > 0 ? n : Infinity; };

export function CommissionCalculatorScreen({ onBack }: Props) {
  const [data, setData] = useState<CalculatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [basePrice, setBasePrice]         = useState("");
  const [vendorOfferPct, setVendorOfferPct] = useState("");
  const [vendorOfferCap, setVendorOfferCap] = useState("");
  const [dashitoOfferPct, setDashitoOfferPct] = useState("");
  const [dashitoOfferCap, setDashitoOfferCap] = useState("");
  const [servicesAmount, setServicesAmount] = useState("");

  useEffect(() => {
    api.get("/vendor/commission-calculator").then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const commissionRate = data?.commissionRate ?? 0;
  const pgCharge        = data?.paymentGatewayChargeSetting;
  const totals           = data?.totals ?? { dashitoPrice: 0, commissionAmount: 0, paymentGatewayChargeAmount: 0, vendorPayout: 0 };
  const orders            = data?.orders ?? [];

  const breakdown = useMemo(() => {
    const price = parseFloat(basePrice);
    if (!basePrice || isNaN(price) || price < 0) return null;

    const commissionAmount = price * commissionRate;
    const dashitoPrice = price + commissionAmount;

    const pgAmount = pgCharge?.type === "percentage"
      ? dashitoPrice * pgCharge.amount / 100
      : (pgCharge?.amount ?? 0);

    const vendorOfferRaw = dashitoPrice * (parseFloat(vendorOfferPct) || 0) / 100;
    const vendorOfferDeduction = Math.min(vendorOfferRaw, capOrInfinity(vendorOfferCap));

    const dashitoOfferRaw = dashitoPrice * (parseFloat(dashitoOfferPct) || 0) / 100;
    const dashitoOfferDiscount = Math.min(dashitoOfferRaw, capOrInfinity(dashitoOfferCap));
    const dashitoOfferVendorShare = dashitoOfferDiscount * 0.5;

    const servicesFee = parseFloat(servicesAmount) || 0;
    const totalDeductions = pgAmount + vendorOfferDeduction + dashitoOfferVendorShare + servicesFee;

    return {
      basePrice: price, commissionAmount, dashitoPrice, pgAmount,
      vendorOfferDeduction, dashitoOfferVendorShare, servicesFee,
      totalDeductions, settlementToVendor: price - totalDeductions,
    };
  }, [basePrice, commissionRate, pgCharge, vendorOfferPct, vendorOfferCap, dashitoOfferPct, dashitoOfferCap, servicesAmount]);

  const toggleOrder = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Amount Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

          {/* Rate summary */}
          <View style={styles.statGrid}>
            <View style={[styles.statCard, { borderLeftColor: "#8b5cf6" }]}>
              <Text style={styles.statLabel}>Your Commission Rate</Text>
              <Text style={[styles.statValue, { color: "#8b5cf6" }]}>{Math.round(commissionRate * 100)}%</Text>
              <Text style={styles.statSub}>Set by Dashito</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: "#3b82f6" }]}>
              <Text style={styles.statLabel}>Payment Gateway Charge</Text>
              <Text style={[styles.statValue, { color: "#3b82f6" }]}>{settingLabel(pgCharge)}</Text>
              <Text style={styles.statSub}>Deducted every order</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: "#f97316" }]}>
              <Text style={styles.statLabel}>Payout (last 50)</Text>
              <Text style={[styles.statValue, { color: "#f97316" }]}>{INR(totals.vendorPayout)}</Text>
              <Text style={styles.statSub}>{orders.length} delivered</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: "#059669" }]}>
              <Text style={styles.statLabel}>Dashito Price Total</Text>
              <Text style={[styles.statValue, { color: "#059669" }]}>{INR(totals.dashitoPrice)}</Text>
              <Text style={styles.statSub}>Charged to customers</Text>
            </View>
          </View>

          {/* Amount calculator */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Amount Calculator - From Menu Item Price</Text>
            <Text style={styles.cardSub}>See the Dashito Price and your final settlement after Vendor Deductions.</Text>

            <Text style={styles.fieldLabel}>Item/Menu Price (₹)</Text>
            <TextInput style={styles.input} value={basePrice} onChangeText={setBasePrice} placeholder="e.g. 200" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />

            <Text style={styles.fieldLabel}>Vendor Offer <Text style={styles.fieldNote}>(you bear 100%)</Text></Text>
            <View style={styles.row2}>
              <TextInput style={[styles.input, { flex: 1 }]} value={vendorOfferPct} onChangeText={setVendorOfferPct} placeholder="% e.g. 25" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
              <TextInput style={[styles.input, { flex: 1 }]} value={vendorOfferCap} onChangeText={setVendorOfferCap} placeholder="cap ₹" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
            </View>

            <Text style={styles.fieldLabel}>Dashito Promotion &amp; Offer <Text style={styles.fieldNote}>(you bear 50%)</Text></Text>
            <View style={styles.row2}>
              <TextInput style={[styles.input, { flex: 1 }]} value={dashitoOfferPct} onChangeText={setDashitoOfferPct} placeholder="% e.g. 50" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
              <TextInput style={[styles.input, { flex: 1 }]} value={dashitoOfferCap} onChangeText={setDashitoOfferCap} placeholder="cap ₹" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
            </View>

            <Text style={styles.fieldLabel}>Services Taken from Dashito <Text style={styles.fieldNote}>(optional)</Text></Text>
            <TextInput style={styles.input} value={servicesAmount} onChangeText={setServicesAmount} placeholder="0" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />

            <View style={styles.resultBox}>
              <Text style={styles.resultLabelOrange}>Dashito Price (for customer)</Text>
              <Text style={styles.resultValueOrange}>{breakdown ? INR(breakdown.dashitoPrice) : "—"}</Text>
              <Text style={styles.resultHint}>
                Item/Menu Price + Commission ({Math.round(commissionRate * 100)}%){breakdown ? ` = ${INR(breakdown.basePrice)} + ${INR(breakdown.commissionAmount)}` : ""}
              </Text>
            </View>

            <Text style={styles.deductTitle}>Vendor Deductions</Text>
            <View style={styles.deductGrid}>
              <View style={styles.deductCard}>
                <Text style={styles.deductLabel}>PG Deduction ({settingLabel(pgCharge)})</Text>
                <Text style={styles.deductValue}>{breakdown ? `− ${INR(breakdown.pgAmount)}` : "—"}</Text>
              </View>
              <View style={styles.deductCard}>
                <Text style={styles.deductLabel}>Vendor Offer (100%)</Text>
                <Text style={styles.deductValue}>{breakdown ? `− ${INR(breakdown.vendorOfferDeduction)}` : "—"}</Text>
              </View>
              <View style={styles.deductCard}>
                <Text style={styles.deductLabel}>Dashito Offer (50% share)</Text>
                <Text style={styles.deductValue}>{breakdown ? `− ${INR(breakdown.dashitoOfferVendorShare)}` : "—"}</Text>
              </View>
              <View style={styles.deductCard}>
                <Text style={styles.deductLabel}>Services from Dashito</Text>
                <Text style={styles.deductValue}>{breakdown ? `− ${INR(breakdown.servicesFee)}` : "—"}</Text>
              </View>
            </View>

            <View style={styles.resultBoxGreen}>
              <Text style={styles.resultLabelGreen}>Settlement to Vendor <Text style={styles.fieldNote}>(Price − Deductions)</Text></Text>
              <Text style={styles.resultValueGreen}>{breakdown ? INR(breakdown.settlementToVendor) : "—"}</Text>
            </View>
          </View>

          {/* Order details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order Details &amp; Settlement</Text>
            <Text style={styles.cardSub}>Every delivered order's commission-based settlement breakdown.</Text>

            {orders.length === 0 ? (
              <Text style={styles.emptyText}>No delivered orders yet</Text>
            ) : orders.map(o => {
              const isExpanded = expanded.has(o.id);
              const isPaid = o.settlement?.status === "PAID";
              return (
                <View key={o.id} style={styles.orderRow}>
                  <TouchableOpacity style={styles.orderHeader} onPress={() => toggleOrder(o.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderNumber}>{isExpanded ? "▾" : "▸"} #{o.orderNumber?.slice(-8).toUpperCase()}</Text>
                      <Text style={styles.orderItemsPreview} numberOfLines={1}>
                        {(o.items || []).map(it => `${it.name} ×${it.quantity}`).join(", ")}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.orderPayout}>{INR(o.vendorPayout)}</Text>
                      <View style={[styles.settleBadge, { backgroundColor: isPaid ? "#f0fdf4" : "#fffbeb" }]}>
                        <Text style={[styles.settleBadgeText, { color: isPaid ? "#16a34a" : "#d97706" }]}>{isPaid ? "Settled" : "Pending"}</Text>
                      </View>
                      {isPaid && o.settlement?.paidAt && (
                        <Text style={styles.settleMeta}>{new Date(o.settlement.paidAt).toLocaleDateString("en-IN")}</Text>
                      )}
                      {isPaid && o.settlement?.utrNumber && (
                        <Text style={styles.settleMeta}>UTR {o.settlement.utrNumber}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.orderDetail}>
                      <View style={styles.orderDetailRow}>
                        <Text style={styles.orderDetailLabel}>Gross (Dashito Price)</Text>
                        <Text style={styles.orderDetailValue}>{INR(o.dashitoPrice)}</Text>
                      </View>
                      <View style={styles.orderDetailRow}>
                        <Text style={styles.orderDetailLabel}>Commission</Text>
                        <Text style={styles.orderDetailValueRed}>− {INR(o.commissionAmount)}</Text>
                      </View>
                      <View style={styles.orderDetailRow}>
                        <Text style={styles.orderDetailLabel}>PG Charge</Text>
                        <Text style={styles.orderDetailValueRed}>− {INR(o.paymentGatewayChargeAmount)}</Text>
                      </View>
                      <View style={[styles.orderDetailRow, { borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 6, marginTop: 2 }]}>
                        <Text style={[styles.orderDetailLabel, { fontWeight: "700", color: "#111827" }]}>Net Payable</Text>
                        <Text style={styles.orderDetailValueGreen}>{INR(o.vendorPayout)}</Text>
                      </View>
                      <Text style={[styles.orderDetailLabel, { marginTop: 10, marginBottom: 4, fontWeight: "700" }]}>Item-wise Pricing</Text>
                      <View style={styles.itemHeaderRow}>
                        <Text style={[styles.itemHeaderText, styles.itemColName]}>Item</Text>
                        <Text style={[styles.itemHeaderText, styles.itemColNum]}>Base</Text>
                        <Text style={[styles.itemHeaderText, styles.itemColNum]}>Dashito</Text>
                        <Text style={[styles.itemHeaderText, styles.itemColNum]}>Total</Text>
                      </View>
                      {(o.items || []).map((it, idx) => (
                        <View key={idx} style={styles.itemLine}>
                          <Text style={[styles.itemLineName, styles.itemColName]} numberOfLines={1}>{it.name} ×{it.quantity}</Text>
                          <Text style={[styles.itemLineValue, styles.itemColNum]}>{INR(it.basePrice)}</Text>
                          <Text style={[styles.itemLineValue, styles.itemColNum]}>{INR(it.dashitoPrice)}</Text>
                          <Text style={[styles.itemLineTotal, styles.itemColNum]}>{INR(it.totalPrice)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
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

  statGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard:    { flex: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 12, padding: 14, borderLeftWidth: 3, borderWidth: 1, borderColor: "#f3f4f6" },
  statLabel:   { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.3 },
  statValue:   { fontSize: 18, fontWeight: "800", marginTop: 4 },
  statSub:     { fontSize: 10, color: "#9ca3af", marginTop: 3 },

  card:        { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#f3f4f6" },
  cardTitle:   { fontSize: 15, fontWeight: "800", color: "#111827" },
  cardSub:     { fontSize: 12, color: "#9ca3af", marginTop: 3, marginBottom: 14 },

  fieldLabel:  { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6, marginTop: 12 },
  fieldNote:   { fontSize: 11, fontWeight: "400", color: "#9ca3af", textTransform: "none" },
  input:       { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontWeight: "600", color: "#111827", backgroundColor: "#f9fafb" },
  row2:        { flexDirection: "row", gap: 10 },

  resultBox:      { backgroundColor: "#fff7ed", borderRadius: 12, padding: 14, marginTop: 16 },
  resultLabelOrange: { fontSize: 11, fontWeight: "700", color: "#c2410c", textTransform: "uppercase" },
  resultValueOrange: { fontSize: 20, fontWeight: "900", color: "#c2410c", marginTop: 2 },
  resultHint:     { fontSize: 11, color: "#c2410c", opacity: 0.7, marginTop: 3 },

  deductTitle: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginTop: 14, marginBottom: 8 },
  deductGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  deductCard:  { flex: 1, minWidth: "45%", backgroundColor: "#f9fafb", borderRadius: 10, padding: 10 },
  deductLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },
  deductValue: { fontSize: 15, fontWeight: "800", color: "#ef4444", marginTop: 3 },

  resultBoxGreen: { backgroundColor: "#f0fdf4", borderRadius: 12, padding: 14, marginTop: 14 },
  resultLabelGreen: { fontSize: 11, fontWeight: "700", color: "#15803d", textTransform: "uppercase" },
  resultValueGreen: { fontSize: 20, fontWeight: "900", color: "#15803d", marginTop: 2 },

  emptyText:   { textAlign: "center", color: "#9ca3af", paddingVertical: 20, fontSize: 13 },

  orderRow:    { borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 4 },
  orderHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  orderNumber: { fontSize: 13, fontWeight: "700", color: "#374151" },
  orderItemsPreview: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  orderPayout: { fontSize: 14, fontWeight: "800", color: "#15803d" },
  settleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  settleBadgeText: { fontSize: 10, fontWeight: "700" },
  settleMeta: { fontSize: 9, color: "#9ca3af", marginTop: 2 },
  orderDetail: { backgroundColor: "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 10 },
  orderDetailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  orderDetailLabel: { fontSize: 12, color: "#6b7280" },
  orderDetailValue: { fontSize: 12, fontWeight: "700", color: "#111827" },
  orderDetailValueRed: { fontSize: 12, fontWeight: "700", color: "#ef4444" },
  orderDetailValueGreen: { fontSize: 13, fontWeight: "800", color: "#15803d" },
  itemHeaderRow:{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 4, marginBottom: 2 },
  itemHeaderText:{ fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.3 },
  itemColName: { flex: 1.6 },
  itemColNum:  { flex: 1, textAlign: "right" },
  itemLine:    { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  itemLineName:{ fontSize: 12, color: "#374151", marginRight: 4 },
  itemLineValue:{ fontSize: 11, color: "#6b7280" },
  itemLineTotal:{ fontSize: 12, fontWeight: "700", color: "#111827" },
});
