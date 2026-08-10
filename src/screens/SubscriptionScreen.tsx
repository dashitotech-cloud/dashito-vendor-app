import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, AppState,
} from "react-native";
import { api } from "../lib/api";

interface Plan {
  id: string;
  name: string;
  tagline?: string;
  monthlyPrice: number;
  yearlyPrice?: number | null;
  features: string | string[];
  commissionDiscount?: number;
  maxMenuItems?: number;
  trialDays?: number;
  isPopular?: boolean;
  badgeColor?: string;
}

interface Subscription {
  planId: string;
  planName: string;
  tagline?: string;
  status: "ACTIVE" | "TRIAL" | "EXPIRED" | "CANCELLED";
  billingCycle?: string;
  monthlyPrice: number;
  startDate?: string;
  endDate?: string;
  autoRenew?: boolean;
  commissionDiscount?: number;
  features: string | string[];
  badgeColor?: string;
}

interface Payment {
  id: string;
  planName?: string;
  billingCycle: string;
  amount?: number | null;
  status: "SUCCESS" | "FAILED";
  periodStart?: string | null;
  periodEnd?: string | null;
  paidAt: string;
}

interface Props { onBack: () => void }

const BADGE_COLORS: Record<string, string> = {
  orange: "#f97316", violet: "#8b5cf6", emerald: "#10b981",
  blue: "#3b82f6", rose: "#f43f5e", amber: "#f59e0b",
};

function parseFeatures(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function fmtDate(d?: string | null): string {
  if (!d) return "No expiry";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function fmtShortDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ACTIVE:    { bg: "#d1fae5", text: "#065f46" },
    TRIAL:     { bg: "#dbeafe", text: "#1e40af" },
    EXPIRED:   { bg: "#f3f4f6", text: "#6b7280" },
    CANCELLED: { bg: "#fee2e2", text: "#991b1b" },
  };
  const c = colors[status] || colors.EXPIRED;
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.text }}>{status}</Text>
    </View>
  );
}

function CurrentPlanCard({
  subscription, onCancel, cancelling,
}: {
  subscription: Subscription;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const features     = parseFeatures(subscription.features);
  const accentColor  = BADGE_COLORS[subscription.badgeColor || "orange"] || "#f97316";
  const isFree       = Number(subscription.monthlyPrice) === 0;

  return (
    <View style={[s.planCard, { borderColor: accentColor + "40", borderWidth: 2 }]}>
      <View style={[s.planHeaderBg, { backgroundColor: accentColor + "15" }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={[s.planName, { color: accentColor }]}>{subscription.planName}</Text>
            <StatusBadge status={subscription.status} />
          </View>
          {subscription.tagline ? <Text style={s.planTagline}>{subscription.tagline}</Text> : null}
        </View>
        <Text style={[s.currentPlanPrice, { color: accentColor }]}>
          {isFree ? "Free" : `₹${Number(subscription.monthlyPrice).toLocaleString("en-IN")}/mo`}
        </Text>
      </View>

      <View style={s.planBody}>
        {features.map((f, i) => (
          <View key={i} style={s.featureRow}>
            <Text style={[s.featureBullet, { color: accentColor }]}>✓</Text>
            <Text style={s.featureText}>{f}</Text>
          </View>
        ))}
        {subscription.commissionDiscount && subscription.commissionDiscount > 0 ? (
          <View style={s.featureRow}>
            <Text style={[s.featureBullet, { color: accentColor }]}>✓</Text>
            <Text style={s.featureText}>{Number(subscription.commissionDiscount).toFixed(0)}% commission discount</Text>
          </View>
        ) : null}

        <Text style={[s.dateText, { fontWeight: "700", color: "#374151" }]}>
          📅 Valid: {fmtDate(subscription.startDate)} — {fmtDate(subscription.endDate)}
        </Text>
        {subscription.endDate ? (
          <Text style={s.dateText}>
            🔄 {subscription.autoRenew ? "Auto-renews" : "Expires"} on {fmtDate(subscription.endDate)}
          </Text>
        ) : null}

        {subscription.status === "ACTIVE" && (
          <TouchableOpacity onPress={onCancel} disabled={cancelling} style={s.cancelBtn}>
            <Text style={s.cancelBtnText}>{cancelling ? "Cancelling…" : "✕  Cancel Subscription"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function PlanCard({
  plan, isCurrentPlan, billingCycle, onSubscribe, subscribing,
}: {
  plan: Plan;
  isCurrentPlan: boolean;
  billingCycle: "MONTHLY" | "YEARLY";
  onSubscribe: (plan: Plan) => void;
  subscribing: boolean;
}) {
  const features    = parseFeatures(plan.features);
  const accentColor = BADGE_COLORS[plan.badgeColor || "orange"] || "#f97316";
  const isFree      = Number(plan.monthlyPrice) === 0;
  const price       = billingCycle === "YEARLY" && plan.yearlyPrice != null
    ? plan.yearlyPrice : plan.monthlyPrice;
  const saving      = billingCycle === "YEARLY" && plan.yearlyPrice != null
    ? Math.round(100 - (plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100) : 0;

  return (
    <View style={[s.planCard, isCurrentPlan && { borderColor: accentColor + "60", borderWidth: 2 }]}>
      {(plan.isPopular || isCurrentPlan) && (
        <View style={[s.popularBadge, { backgroundColor: accentColor }]}>
          <Text style={s.popularBadgeText}>
            {isCurrentPlan ? "✓ Current Plan" : "⭐ Most Popular"}
          </Text>
        </View>
      )}

      <View style={s.planHeader}>
        <View style={[s.planNameBadge, { backgroundColor: accentColor + "20" }]}>
          <Text style={[s.planNameBadgeText, { color: accentColor }]}>{plan.name}</Text>
        </View>
        {plan.tagline ? <Text style={s.planTagline}>{plan.tagline}</Text> : null}

        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 8 }}>
          {isFree ? (
            <Text style={s.planPriceMain}>Free</Text>
          ) : (
            <>
              <Text style={s.planPriceCurrency}>₹</Text>
              <Text style={s.planPriceMain}>{Number(price).toLocaleString("en-IN")}</Text>
              <Text style={s.planPricePeriod}>/{billingCycle === "YEARLY" ? "year" : "month"}</Text>
            </>
          )}
        </View>
        {saving > 0 && (
          <View style={s.savingBadge}>
            <Text style={s.savingBadgeText}>Save {saving}% annually</Text>
          </View>
        )}
      </View>

      <View style={s.planBody}>
        {features.map((f, i) => (
          <View key={i} style={s.featureRow}>
            <Text style={[s.featureBullet, { color: accentColor }]}>✓</Text>
            <Text style={s.featureText}>{f}</Text>
          </View>
        ))}
        {plan.commissionDiscount && plan.commissionDiscount > 0 ? (
          <View style={s.featureRow}>
            <Text style={[s.featureBullet, { color: accentColor }]}>✓</Text>
            <Text style={s.featureText}>{Number(plan.commissionDiscount).toFixed(0)}% commission discount</Text>
          </View>
        ) : null}
        {plan.maxMenuItems ? (
          <View style={s.featureRow}>
            <Text style={[s.featureBullet, { color: accentColor }]}>✓</Text>
            <Text style={s.featureText}>Up to {plan.maxMenuItems.toLocaleString("en-IN")} menu items</Text>
          </View>
        ) : null}
        {plan.trialDays && plan.trialDays > 0 ? (
          <View style={s.featureRow}>
            <Text style={[s.featureBullet, { color: "#f97316" }]}>✓</Text>
            <Text style={[s.featureText, { color: "#f97316", fontWeight: "600" }]}>
              {plan.trialDays}-day free trial
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => onSubscribe(plan)}
          disabled={isCurrentPlan || subscribing}
          style={[
            s.subscribeBtn,
            isCurrentPlan
              ? { backgroundColor: accentColor + "20" }
              : { backgroundColor: accentColor },
            (isCurrentPlan || subscribing) && { opacity: 0.6 },
          ]}
        >
          {subscribing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[s.subscribeBtnText, isCurrentPlan && { color: accentColor }]}>
              {isCurrentPlan ? "Current Plan" : "Get Started"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PaymentHistorySection({ payments }: { payments: Payment[] }) {
  if (!payments.length) return null;
  const statusColors: Record<string, { bg: string; text: string }> = {
    SUCCESS: { bg: "#d1fae5", text: "#065f46" },
    FAILED:  { bg: "#fee2e2", text: "#991b1b" },
  };
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>PAYMENT HISTORY</Text>
      <View style={s.historyCard}>
        {payments.map((p, i) => {
          const c = statusColors[p.status] || statusColors.FAILED;
          return (
            <View key={p.id} style={[s.historyRow, i === payments.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.historyPlan}>{p.planName || "—"}</Text>
                <Text style={s.historyDate}>{fmtShortDate(p.paidAt)}</Text>
                {p.periodStart ? (
                  <Text style={s.historyPeriod}>{fmtShortDate(p.periodStart)} – {fmtShortDate(p.periodEnd)}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.historyAmount}>{p.amount != null ? `₹${Number(p.amount).toLocaleString("en-IN")}` : "—"}</Text>
                <View style={{ backgroundColor: c.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, marginTop: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: c.text }}>{p.status}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function SubscriptionScreen({ onBack }: Props) {
  const [plans, setPlans]           = useState<Plan[]>([]);
  const [subscription, setSub]      = useState<Subscription | null>(null);
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [billing, setBilling]       = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [subscribingId, setSubId]   = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [plansExpanded, setPlansExpanded] = useState(false);
  const pendingPaymentRef = useRef(false);
  const prevStatusRef     = useRef<string | undefined>(undefined);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [plansRes, subRes, paymentsRes] = await Promise.all([
        api.get("/vendor/subscription-plans"),
        api.get("/vendor/subscription").catch(() => ({ data: { subscription: null } })),
        api.get("/vendor/subscription/payments").catch(() => ({ data: { payments: [] } })),
      ]);
      setPlans(plansRes.data.plans ?? []);
      const newSub = subRes.data.subscription ?? null;
      setSub(newSub);
      setPayments(paymentsRes.data.payments ?? []);
      return newSub;
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // Mobile has no way back into the app via deep link after paying in the
  // external browser (EaseBuzz redirect), so instead: when the vendor
  // returns to the app after a subscribe attempt, re-check status.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active" || !pendingPaymentRef.current) return;
      pendingPaymentRef.current = false;
      setCheckingPayment(true);
      const before = prevStatusRef.current;
      const updated = await fetchData(true);
      setCheckingPayment(false);
      if (updated && updated.status !== before && (updated.status === "ACTIVE" || updated.status === "TRIAL")) {
        Alert.alert("Payment Successful!", "Your subscription is now active.");
      } else {
        Alert.alert(
          "Payment Not Confirmed",
          "We couldn't confirm your payment yet. If you completed it, this may take a minute to reflect — pull to check again.",
        );
      }
    });
    return () => sub.remove();
  }, []);

  const hasYearly = plans.some(p => p.yearlyPrice != null);
  const yearlySavings = plans
    .filter(p => p.yearlyPrice != null && p.monthlyPrice > 0)
    .map(p => Math.round(100 - (p.yearlyPrice! / (p.monthlyPrice * 12)) * 100));
  const maxSaving = yearlySavings.length ? Math.max(...yearlySavings) : 0;

  const handleSubscribe = async (plan: Plan) => {
    setSubId(plan.id);
    try {
      const res  = await api.post("/vendor/subscription/subscribe", { planId: plan.id, billingCycle: billing, platform: "mobile" });
      const data = res.data;
      if (data.requiresPayment && data.paymentUrl) {
        Alert.alert(
          "Payment Required",
          "You'll be redirected to complete the payment. We'll automatically check your subscription status when you return to the app.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Pay Now", onPress: () => {
              prevStatusRef.current = subscription?.status;
              pendingPaymentRef.current = true;
              Linking.openURL(data.paymentUrl);
            } },
          ]
        );
      } else {
        Alert.alert("Success", "Subscription activated!");
        await fetchData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to subscribe");
    } finally {
      setSubId(null);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      "Cancel Subscription",
      "Cancel your subscription? You will retain access until the current period ends.",
      [
        { text: "Keep Subscription", style: "cancel" },
        {
          text: "Cancel", style: "destructive", onPress: async () => {
            setCancelling(true);
            try {
              await api.delete("/vendor/subscription/cancel");
              Alert.alert("Cancelled", "Your subscription has been cancelled.");
              await fetchData();
            } catch (err: any) {
              Alert.alert("Error", err.response?.data?.error || "Failed to cancel");
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Subscription</Text>
          <Text style={s.headerSub}>Choose a plan that fits your growth</Text>
        </View>
      </View>

      {checkingPayment && (
        <View style={s.checkingBanner}>
          <ActivityIndicator size="small" color="#059669" />
          <Text style={s.checkingBannerText}>Checking your payment status…</Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          {/* Current plan */}
          {subscription && (
            <View style={s.section}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={[s.sectionLabel, { marginBottom: 0 }]}>YOUR CURRENT PLAN</Text>
                <TouchableOpacity onPress={() => setPlansExpanded(v => !v)}>
                  <Text style={s.changePlanLink}>{plansExpanded ? "Hide Plans" : "Change Plan ›"}</Text>
                </TouchableOpacity>
              </View>
              <CurrentPlanCard
                subscription={subscription}
                onCancel={handleCancel}
                cancelling={cancelling}
              />
            </View>
          )}

          {/* Payment history */}
          <PaymentHistorySection payments={payments} />

          {/* Plans — hidden by default once subscribed, to avoid repeatedly prompting
              an already-subscribed vendor to pay again. Toggled via "Change Plan"
              above. Always shown when there's no active subscription. */}
          {(!subscription || plansExpanded) && (
            <>
              {hasYearly && (
                <View style={s.billingToggle}>
                  {(["MONTHLY", "YEARLY"] as const).map(b => (
                    <TouchableOpacity
                      key={b}
                      style={[s.billingBtn, billing === b && s.billingBtnActive]}
                      onPress={() => setBilling(b)}
                    >
                      <Text style={[s.billingBtnText, billing === b && s.billingBtnTextActive]}>
                        {b === "MONTHLY" ? "Monthly" : "Yearly"}
                      </Text>
                      {b === "YEARLY" && maxSaving > 0 && <Text style={s.saveText}>  Save {maxSaving}%</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={s.section}>
                <Text style={s.sectionLabel}>{subscription ? "CHANGE PLAN" : "AVAILABLE PLANS"}</Text>
                {plans.length === 0 ? (
                  <View style={s.emptyCard}>
                    <Text style={s.emptyIcon}>💳</Text>
                    <Text style={s.emptyText}>No subscription plans available yet</Text>
                  </View>
                ) : (
                  plans.map(plan => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isCurrentPlan={subscription?.planId === plan.id && subscription?.status !== "CANCELLED"}
                      billingCycle={billing}
                      onSubscribe={handleSubscribe}
                      subscribing={subscribingId === plan.id}
                    />
                  ))
                )}
              </View>
            </>
          )}

          <Text style={s.footerNote}>
            All prices are exclusive of applicable taxes. Upgrading takes effect immediately.
            Contact support for enterprise pricing.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#f9fafb" },
  header:        { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn:       { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6", borderRadius: 10 },
  backBtnText:   { fontSize: 22, color: "#374151", fontWeight: "600", lineHeight: 24 },
  headerTitle:   { fontSize: 16, fontWeight: "700", color: "#111827" },
  headerSub:     { fontSize: 12, color: "#9ca3af", marginTop: 1 },
  center:        { flex: 1, alignItems: "center", justifyContent: "center" },
  checkingBanner:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f0fdf4", borderBottomWidth: 1, borderBottomColor: "#bbf7d0", paddingHorizontal: 16, paddingVertical: 10 },
  checkingBannerText: { fontSize: 12, fontWeight: "600", color: "#059669" },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section:       { marginBottom: 20 },
  sectionLabel:  { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  changePlanLink: { fontSize: 12, fontWeight: "700", color: "#f97316" },

  historyCard:   { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#f3f4f6", overflow: "hidden" },
  historyRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  historyPlan:   { fontSize: 13, fontWeight: "700", color: "#111827" },
  historyDate:   { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  historyPeriod: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: "800", color: "#111827" },

  billingToggle:        { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 12, padding: 4, marginBottom: 20 },
  billingBtn:           { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center" },
  billingBtnActive:     { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  billingBtnText:       { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  billingBtnTextActive: { color: "#111827" },
  saveText:             { fontSize: 11, color: "#059669", fontWeight: "700" },

  planCard:         { backgroundColor: "#fff", borderRadius: 16, marginBottom: 14, borderWidth: 1, borderColor: "#f3f4f6", overflow: "hidden" },
  planHeaderBg:     { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 16, gap: 8 },
  planHeader:       { padding: 16 },
  planNameBadge:    { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 6 },
  planNameBadgeText:{ fontSize: 12, fontWeight: "700" },
  planName:         { fontSize: 16, fontWeight: "800" },
  planTagline:      { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  currentPlanPrice: { fontSize: 18, fontWeight: "800", flexShrink: 0 },
  planPriceCurrency:{ fontSize: 16, fontWeight: "700", color: "#111827" },
  planPriceMain:    { fontSize: 28, fontWeight: "900", color: "#111827" },
  planPricePeriod:  { fontSize: 13, color: "#9ca3af" },
  savingBadge:      { marginTop: 6, alignSelf: "flex-start", backgroundColor: "#d1fae5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  savingBadgeText:  { fontSize: 11, fontWeight: "700", color: "#065f46" },

  planBody:       { paddingHorizontal: 16, paddingBottom: 16 },
  featureRow:     { flexDirection: "row", gap: 8, marginBottom: 6 },
  featureBullet:  { fontSize: 13, fontWeight: "700", width: 16 },
  featureText:    { flex: 1, fontSize: 13, color: "#6b7280", lineHeight: 20 },
  dateText:       { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  cancelBtn:      { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  cancelBtnText:  { fontSize: 13, fontWeight: "700", color: "#ef4444" },

  subscribeBtn:     { marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center", minHeight: 46 },
  subscribeBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  popularBadge:     { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 5, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  popularBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  emptyCard:  { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", borderWidth: 1, borderColor: "#f3f4f6" },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 14, color: "#9ca3af" },
  footerNote: { fontSize: 12, color: "#9ca3af", textAlign: "center", lineHeight: 18, marginTop: 8 },
});
