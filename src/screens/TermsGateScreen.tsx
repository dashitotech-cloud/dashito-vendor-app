import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { api } from "../lib/api";
import { HtmlContent } from "../lib/htmlRenderer";

interface TermsTemplate {
  id: string;
  title: string;
  version: string;
  content: string;
}

interface Props {
  onAccepted: () => void;
}

const DESIGNATION_MAP: Record<string, string> = {
  PROPRIETORSHIP:  "Proprietor",
  PARTNERSHIP:     "Partner",
  PRIVATE_LIMITED: "Director",
  PVT_LTD:        "Director",
  LLP:             "Designated Partner",
  PUBLIC_LIMITED:  "Director",
  OPC:             "Director",
  HUF:             "Karta",
  TRUST:           "Trustee",
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={ts.detailRow}>
      <Text style={ts.detailLabel}>{label}</Text>
      <Text style={ts.detailValue}>{value || "—"}</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function TermsGateScreen({ onAccepted }: Props) {
  const [template,   setTemplate]   = useState<TermsTemplate | null>(null);
  const [profile,    setProfile]    = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [agreed,     setAgreed]     = useState(false);
  const [signature,  setSignature]  = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/terms/active"),
      api.get("/vendor/profile").catch(() => ({ data: null })),
    ])
      .then(([termsRes, profileRes]) => {
        const tpl = termsRes.data?.template ?? null;
        if (!tpl) {
          // No active terms — proceed immediately
          onAccepted();
          return;
        }
        setTemplate(tpl);
        if (profileRes.data) setProfile(profileRes.data);
      })
      .catch(() => Alert.alert("Error", "Failed to load terms. Please restart the app."))
      .finally(() => setLoading(false));
  }, []);

  const handleAccept = async () => {
    if (!agreed)           { Alert.alert("Required", "Please check the agreement checkbox first"); return; }
    if (!signature.trim()) { Alert.alert("Required", "Please type your full name as your digital signature"); return; }
    setSubmitting(true);
    try {
      await api.post("/terms/agree", { templateId: template!.id, signature: signature.trim() });
      Alert.alert("Welcome!", "Terms accepted! Welcome to Dashito Vendor App.", [
        { text: "Continue", onPress: onAccepted },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={ts.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  if (!template) return null;

  const restaurant = profile?.restaurant || {};
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <KeyboardAvoidingView
      style={ts.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={ts.scroll} keyboardShouldPersistTaps="handled">

        {/* Header band */}
        <View style={ts.headerBand}>
          <Text style={ts.headerLabel}>📋  Vendor Agreement — Action Required</Text>
          <Text style={ts.templateTitle}>{template.title}</Text>
          <Text style={ts.templateVersion}>Version {template.version}</Text>
        </View>

        {/* T&C content */}
        <View style={ts.card}>
          <HtmlContent html={template.content} />
        </View>

        {/* Party & signatory details */}
        <View style={ts.card}>
          <Text style={ts.cardSectionLabel}>PARTY & SIGNATORY DETAILS</Text>
          <DetailRow label="Vendor Entity"  value={restaurant.legalEntityName} />
          <DetailRow label="Signatory"      value={restaurant.contactPersonName} />
          <DetailRow label="Designation"    value={DESIGNATION_MAP[restaurant.businessType || ""] || restaurant.businessType} />
          <DetailRow label="Date"           value={today} />
          <DetailRow label="Place"          value={restaurant.city} />
          <DetailRow label="FSSAI No."      value={restaurant.fssaiNumber} />
          <DetailRow label="GSTIN"          value={restaurant.gstin} />
          <DetailRow label="PAN"            value={restaurant.pan} />

          {/* Live signature preview */}
          {signature.trim() ? (
            <View style={ts.signaturePreview}>
              <Text style={ts.signaturePreviewLabel}>DIGITAL SIGNATURE</Text>
              <Text style={ts.signaturePreviewText}>{signature}</Text>
              <Text style={ts.signaturePreviewDate}>{today}</Text>
            </View>
          ) : null}
        </View>

        {/* Checkbox */}
        <TouchableOpacity style={ts.checkboxRow} onPress={() => setAgreed(v => !v)} activeOpacity={0.8}>
          <View style={[ts.checkbox, agreed && ts.checkboxChecked]}>
            {agreed ? <Text style={ts.checkmark}>✓</Text> : null}
          </View>
          <Text style={ts.checkboxLabel}>
            I have carefully read and understood the terms and conditions above, and I agree to be legally
            bound by them in connection with my restaurant partnership with Dashito.
          </Text>
        </TouchableOpacity>

        {/* Signature field */}
        <View style={ts.signatureSection}>
          <Text style={ts.signatureLabel}>Digital Signature *</Text>
          <Text style={ts.signatureHint}>
            Type your full legal name. This serves as your digital signature on the agreement.
          </Text>
          <TextInput
            style={ts.signatureInput}
            value={signature}
            onChangeText={setSignature}
            placeholder="Your full legal name"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>

        {/* Accept button */}
        <TouchableOpacity
          onPress={handleAccept}
          disabled={submitting || !agreed || !signature.trim()}
          style={[ts.acceptBtn, (submitting || !agreed || !signature.trim()) && ts.acceptBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={ts.acceptBtnText}>✓  Accept & Continue to Dashboard</Text>
          )}
        </TouchableOpacity>

        <Text style={ts.footerNote}>
          A digitally signed copy of this agreement will be generated and saved on record upon acceptance.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ts = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff7ed" },
  center:    { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:    { padding: 16, paddingBottom: 48 },

  headerBand:      { backgroundColor: "#f97316", borderRadius: 16, padding: 20, marginBottom: 16 },
  headerLabel:     { fontSize: 11, fontWeight: "700", color: "#ffedd5", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  templateTitle:   { fontSize: 20, fontWeight: "800", color: "#fff" },
  templateVersion: { fontSize: 12, color: "#fed7aa", marginTop: 4 },

  card:             { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#fed7aa" },
  cardSectionLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 },

  detailRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  detailLabel: { fontSize: 12, fontWeight: "600", color: "#9ca3af", flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "600", color: "#111827", flex: 2, textAlign: "right" },

  signaturePreview:      { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  signaturePreviewLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  signaturePreviewText:  { fontSize: 22, fontStyle: "italic", color: "#1f2937", fontFamily: "serif" },
  signaturePreviewDate:  { fontSize: 11, color: "#9ca3af", marginTop: 4 },

  checkboxRow:     { flexDirection: "row", gap: 12, padding: 16, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#fed7aa", marginBottom: 16, alignItems: "flex-start" },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  checkboxChecked: { backgroundColor: "#f97316", borderColor: "#f97316" },
  checkmark:       { fontSize: 13, color: "#fff", fontWeight: "700" },
  checkboxLabel:   { flex: 1, fontSize: 13, color: "#374151", lineHeight: 20 },

  signatureSection: { marginBottom: 16 },
  signatureLabel:   { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 4 },
  signatureHint:    { fontSize: 12, color: "#9ca3af", marginBottom: 8, lineHeight: 18 },
  signatureInput:   { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: "#111827" },

  acceptBtn:         { backgroundColor: "#f97316", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: 16 },
  acceptBtnDisabled: { opacity: 0.45 },
  acceptBtnText:     { fontSize: 15, fontWeight: "700", color: "#fff" },
  footerNote:        { fontSize: 12, color: "#9ca3af", textAlign: "center", lineHeight: 18 },
});
