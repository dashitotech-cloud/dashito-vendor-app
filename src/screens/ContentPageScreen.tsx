import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from "react-native";
import { api } from "../lib/api";
import { HtmlContent } from "../lib/htmlRenderer";

const PAGE_LABELS: Record<string, string> = {
  "vendor-policy":         "Vendor's Policy",
  "vendor-terms":          "Vendor's Terms and Conditions",
  "vendor-payment-policy": "Vendor's Payment Policy",
};

interface ContentPage {
  title?: string;
  body?: string;
  updatedAt?: string;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function ContentPageScreen({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [page, setPage]       = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api.get(`/content/${slug}`)
      .then(r => { setPage(r.data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [slug]);

  const label = PAGE_LABELS[slug] || slug;

  return (
    <View style={cs.container}>
      {/* Header */}
      <View style={cs.header}>
        <TouchableOpacity onPress={onBack} style={cs.backBtn}>
          <Text style={cs.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={cs.headerTitle} numberOfLines={1}>{label}</Text>
      </View>

      {loading && (
        <View style={cs.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={cs.loadingText}>Loading…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={cs.center}>
          <Text style={cs.errorIcon}>📄</Text>
          <Text style={cs.errorTitle}>Page not available</Text>
          <Text style={cs.errorSub}>This content has not been published yet.</Text>
        </View>
      )}

      {!loading && !error && page && (
        <ScrollView style={cs.scroll} contentContainerStyle={cs.scrollContent}>
          {/* Page meta */}
          <View style={cs.metaCard}>
            <View style={cs.metaIcon}>
              <Text style={cs.metaIconText}>📋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.metaTitle}>{page.title || label}</Text>
              {page.updatedAt && (
                <Text style={cs.metaDate}>
                  Last updated {new Date(page.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                </Text>
              )}
            </View>
          </View>

          {/* Rendered content */}
          <View style={cs.contentCard}>
            {page.body
              ? <HtmlContent html={page.body} />
              : <Text style={cs.emptyBody}>No content yet.</Text>
            }
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f9fafb" },

  header:       { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", gap: 10 },
  backBtn:      { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6", borderRadius: 10 },
  backBtnText:  { fontSize: 22, color: "#374151", fontWeight: "600", lineHeight: 24 },
  headerTitle:  { flex: 1, fontSize: 16, fontWeight: "700", color: "#111827" },

  center:       { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText:  { marginTop: 12, fontSize: 13, color: "#9ca3af" },
  errorIcon:    { fontSize: 48, marginBottom: 12 },
  errorTitle:   { fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 4 },
  errorSub:     { fontSize: 13, color: "#9ca3af", textAlign: "center" },

  scroll:       { flex: 1 },
  scrollContent:{ padding: 16, paddingBottom: 40 },

  metaCard:     { flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 16 },
  metaIcon:     { width: 44, height: 44, backgroundColor: "#fff7ed", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metaIconText: { fontSize: 22 },
  metaTitle:    { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  metaDate:     { fontSize: 12, color: "#9ca3af" },

  contentCard:  { backgroundColor: "#fff", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#f3f4f6" },

  emptyBody:    { fontSize: 14, color: "#9ca3af", fontStyle: "italic" },
});
