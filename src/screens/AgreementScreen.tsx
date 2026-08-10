import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api } from "../lib/api";
import { HtmlContent } from "../lib/htmlRenderer";

interface Props { onBack: () => void }

interface AgreementData {
  termsAccepted: boolean;
  activeTemplate?: {
    id: string;
    title: string;
    version: string;
    content?: string;
  };
  agreement?: {
    id: string;
    signature: string;
    acceptedAt: string;
    pdfUrl?: string;
  };
}

function DetailRow({ label, value, italic }: { label: string; value?: string; italic?: boolean }) {
  return (
    <View style={as.detailRow}>
      <Text style={as.detailLabel}>{label}</Text>
      <Text style={[as.detailValue, italic ? as.detailValueItalic : undefined]}>{value || "—"}</Text>
    </View>
  );
}

export function AgreementScreen({ onBack }: Props) {
  const [data,     setData]     = useState<AgreementData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get("/terms/my-agreement")
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleOpenPdf = () => {
    const url = data?.agreement?.pdfUrl;
    if (url) {
      Linking.openURL(url).catch(() =>
        Alert.alert("Error", "Could not open PDF. Please try again later.")
      );
    } else {
      Alert.alert("Not Available", "PDF is not yet generated. Please try again later.");
    }
  };

  // Downloads the PDF into the app's cache, then hands it to the native
  // share sheet so the vendor can save it to Files/Drive/etc. — a real
  // on-device download instead of just opening the browser.
  const handleDownloadPdf = async () => {
    const url = data?.agreement?.pdfUrl;
    if (!url) {
      Alert.alert("Not Available", "PDF is not yet generated. Please try again later.");
      return;
    }
    setDownloading(true);
    try {
      const fileName = `dashito-agreement-${data?.agreement?.id?.slice(-8) || "signed"}.pdf`;
      const dest = FileSystem.cacheDirectory + fileName;
      const { uri } = await FileSystem.downloadAsync(url, dest);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Save Agreement PDF" });
      } else {
        Alert.alert("Downloaded", `Saved to ${uri}`);
      }
    } catch {
      Alert.alert("Error", "Could not download PDF. Please try again later.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={as.container}>
      <View style={as.header}>
        <TouchableOpacity onPress={onBack} style={as.backBtn}>
          <Text style={as.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={as.headerTitle}>My Agreement</Text>
          <Text style={as.headerSub}>Your signed vendor partnership agreement</Text>
        </View>
      </View>

      {loading && (
        <View style={as.center}><ActivityIndicator size="large" color="#f97316" /></View>
      )}

      {!loading && error && (
        <View style={as.center}>
          <Text style={as.centerIcon}>⚠️</Text>
          <Text style={as.centerTitle}>Failed to load agreement</Text>
          <Text style={as.centerSub}>Please try again later</Text>
        </View>
      )}

      {!loading && !error && data && (
        <ScrollView style={as.scroll} contentContainerStyle={as.scrollContent}>

          {/* No agreement on file */}
          {!data.termsAccepted && !data.agreement && (
            <View style={as.warnCard}>
              <Text style={as.warnIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={as.warnTitle}>No agreement on file</Text>
                <Text style={as.warnText}>
                  You haven't signed any vendor agreement yet. An agreement will be required before you can operate your store.
                </Text>
              </View>
            </View>
          )}

          {/* No active template */}
          {!data.activeTemplate && (data.termsAccepted || data.agreement) && (
            <View style={as.emptyCard}>
              <Text style={as.emptyIcon}>📄</Text>
              <Text style={as.emptyText}>No agreement terms are currently required</Text>
            </View>
          )}

          {/* Signed agreement */}
          {data.agreement && data.activeTemplate && (
            <>
              {/* Status banner */}
              <View style={as.successBanner}>
                <View style={as.successIconWrap}>
                  <Text style={as.successIconText}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={as.successTitle}>Agreement Signed</Text>
                  <Text style={as.successSub}>
                    You are bound by {data.activeTemplate.title} (v{data.activeTemplate.version})
                  </Text>
                </View>
              </View>

              {/* Agreement details card */}
              <View style={as.card}>
                <View style={as.cardHeader}>
                  <Text style={as.cardHeaderEmoji}>📋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={as.cardHeaderTitle}>{data.activeTemplate.title}</Text>
                    <Text style={as.cardHeaderSub}>Version {data.activeTemplate.version}</Text>
                  </View>
                </View>

                <View style={as.detailList}>
                  <DetailRow label="SIGNED AS"    value={data.agreement.signature} italic />
                  <DetailRow
                    label="DATE SIGNED"
                    value={new Date(data.agreement.acceptedAt).toLocaleString("en-IN", {
                      day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  />
                  <DetailRow label="AGREEMENT ID" value={data.agreement.id} />
                  <DetailRow label="STATUS"       value="Active & Binding" />
                </View>

                {/* PDF actions */}
                <View style={as.pdfRow}>
                  <View style={as.pdfBtnRow}>
                    <TouchableOpacity onPress={handleOpenPdf} style={[as.pdfBtn, { flex: 1 }]}>
                      <Text style={as.pdfBtnText}>👁  View PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDownloadPdf} style={[as.pdfBtn, as.pdfDownloadBtn, { flex: 1 }]} disabled={downloading}>
                      {downloading
                        ? <ActivityIndicator size="small" color="#f97316" />
                        : <Text style={as.pdfDownloadBtnText}>⬇  Download</Text>
                      }
                    </TouchableOpacity>
                  </View>
                  <Text style={as.pdfHint}>Download saves the PDF to your device via the share sheet</Text>
                </View>
              </View>

              {/* T&C collapsible */}
              {data.activeTemplate.content && (
                <View style={as.card}>
                  <TouchableOpacity
                    style={as.expandRow}
                    onPress={() => setExpanded(v => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={as.expandTitle}>✏️  Terms & Conditions Content</Text>
                    <Text style={as.expandToggle}>{expanded ? "Collapse ↑" : "Expand ↓"}</Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={as.expandContent}>
                      <HtmlContent html={data.activeTemplate.content} />
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          <Text style={as.legalNote}>
            This agreement is legally binding. For disputes, contact legal@dashito.in
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const as = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#f9fafb" },
  header:     { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn:    { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6", borderRadius: 10 },
  backBtnText:{ fontSize: 22, color: "#374151", fontWeight: "600", lineHeight: 24 },
  headerTitle:{ fontSize: 16, fontWeight: "700", color: "#111827" },
  headerSub:  { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  center:     { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  centerIcon: { fontSize: 48, marginBottom: 12 },
  centerTitle:{ fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 4 },
  centerSub:  { fontSize: 13, color: "#9ca3af" },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  warnCard:  { flexDirection: "row", gap: 12, backgroundColor: "#fffbeb", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#fde68a", marginBottom: 16 },
  warnIcon:  { fontSize: 22 },
  warnTitle: { fontSize: 14, fontWeight: "700", color: "#92400e" },
  warnText:  { fontSize: 13, color: "#b45309", marginTop: 4, lineHeight: 18 },

  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", borderWidth: 1, borderColor: "#f3f4f6" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#9ca3af" },

  successBanner:   { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#ecfdf5", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#a7f3d0", marginBottom: 16 },
  successIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#d1fae5", alignItems: "center", justifyContent: "center" },
  successIconText: { fontSize: 18, color: "#059669", fontWeight: "700" },
  successTitle:    { fontSize: 14, fontWeight: "700", color: "#065f46" },
  successSub:      { fontSize: 12, color: "#047857", marginTop: 2, lineHeight: 18 },

  card:           { backgroundColor: "#fff", borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: "#f3f4f6", overflow: "hidden" },
  cardHeader:     { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f97316", padding: 16 },
  cardHeaderEmoji:{ fontSize: 22 },
  cardHeaderTitle:{ fontSize: 15, fontWeight: "700", color: "#fff" },
  cardHeaderSub:  { fontSize: 12, color: "#fed7aa", marginTop: 2 },

  detailList:         { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  detailRow:          { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  detailLabel:        { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  detailValue:        { fontSize: 14, fontWeight: "600", color: "#111827" },
  detailValueItalic:  { fontStyle: "italic", fontSize: 16, fontWeight: "400" },

  pdfRow:    { padding: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  pdfBtnRow: { flexDirection: "row", gap: 10 },
  pdfBtn:    { backgroundColor: "#f97316", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  pdfBtnText:{ fontSize: 14, fontWeight: "700", color: "#fff" },
  pdfDownloadBtn:     { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" },
  pdfDownloadBtnText: { fontSize: 14, fontWeight: "700", color: "#f97316" },
  pdfHint:   { fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 8 },

  expandRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  expandTitle:   { fontSize: 14, fontWeight: "700", color: "#111827" },
  expandToggle:  { fontSize: 12, fontWeight: "600", color: "#f97316" },
  expandContent: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: "#f3f4f6" },

  legalNote: { fontSize: 12, color: "#9ca3af", textAlign: "center", lineHeight: 18, marginTop: 8 },
});
