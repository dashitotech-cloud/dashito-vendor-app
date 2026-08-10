import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Linking,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { captureFromCamera, captureFromLibrary, PickedImage } from "../lib/imagePicker";
import { api } from "../lib/api";

interface VendorDoc {
  id: string;
  documentType: string;
  label?: string | null;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
}

interface Props { onBack: () => void }

const DOC_CONFIG = [
  { type: "FSSAI_CERTIFICATE",    label: "FSSAI Certificate",              desc: "Food safety license issued by FSSAI",            required: true  },
  { type: "BUSINESS_REGISTRATION",label: "Business Registration Certificate", desc: "Certificate of incorporation or business registration", required: false },
  { type: "OWNER_ID_PROOF",       label: "Owner ID Proof",                 desc: "Aadhaar card or PAN card of the business owner", required: false },
  { type: "SHOP_ESTABLISHMENT",   label: "Shop & Establishment Certificate", desc: "State-issued shop and establishment license",   required: false },
];

// Multiple files per document type are supported (e.g. front/back/other) —
// mirrors apps/admin/src/pages/vendor/VendorDocuments.jsx.
const SLOT_LABELS = ["Front", "Back", "Other"];

const STATUS_CFG: Record<string, { bg: string; border: string; text: string; label: string }> = {
  PENDING:  { bg: "#fffbeb", border: "#fde68a", text: "#b45309", label: "Pending Review" },
  APPROVED: { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a", label: "Approved" },
  REJECTED: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", label: "Rejected" },
};

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function DocumentsScreen({ onBack }: Props) {
  const [docs, setDocs]             = useState<VendorDoc[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState<Record<string, boolean>>({});
  const [progress, setProgress]     = useState<Record<string, number>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [slotByType, setSlotByType] = useState<Record<string, string>>({});

  const fetchDocs = () => {
    api.get("/vendor/documents")
      .then(r => setDocs(r.data.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, []);

  const docsByType: Record<string, VendorDoc[]> = {};
  for (const d of docs) (docsByType[d.documentType] ||= []).push(d);
  const uploadedTypeCount = DOC_CONFIG.filter(c => (docsByType[c.type] || []).length > 0).length;

  const uploadFile = async (docType: string, file: { uri: string; name: string; type: string }) => {
    const label = slotByType[docType] || "Front";
    setUploading(u => ({ ...u, [docType]: true }));
    setProgress(p => ({ ...p, [docType]: 0 }));
    try {
      const fd = new FormData();
      fd.append("documentType", docType);
      fd.append("label", label);
      fd.append("file", { uri: file.uri, type: file.type, name: file.name } as any);
      await api.post("/vendor/documents", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(p => ({ ...p, [docType]: Math.round((e.loaded / e.total!) * 100) }));
          }
        },
      });
      fetchDocs();
    } catch (err: any) {
      Alert.alert("Upload Failed", err.response?.data?.error || "Please try again");
    } finally {
      setUploading(u => ({ ...u, [docType]: false }));
      setProgress(p => ({ ...p, [docType]: 0 }));
    }
  };

  const pickFromFiles = async (docType: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/jpg", "image/png", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      await uploadFile(docType, { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" });
    } catch (err: any) {
      if (err.message !== "User cancelled document picker") {
        Alert.alert("Upload Failed", err.response?.data?.error || "Please try again");
      }
    }
  };

  const pickFromCamera = async (docType: string) => {
    const file: PickedImage | null = await captureFromCamera({ maxWidth: 1600 });
    if (file) await uploadFile(docType, file);
  };

  const pickFromGallery = async (docType: string) => {
    const file: PickedImage | null = await captureFromLibrary({ maxWidth: 1600 });
    if (file) await uploadFile(docType, file);
  };

  const handleUpload = (docType: string) => {
    Alert.alert("Upload Document", "Choose a source", [
      { text: "Take Photo", onPress: () => pickFromCamera(docType) },
      { text: "Choose Image", onPress: () => pickFromGallery(docType) },
      { text: "Choose PDF / File", onPress: () => pickFromFiles(docType) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleDelete = (doc: VendorDoc) => {
    Alert.alert("Remove document", `Remove "${doc.originalName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setDeletingId(doc.id);
        try {
          await api.delete(`/vendor/documents/${doc.id}`);
          fetchDocs();
        } catch (err: any) {
          Alert.alert("Error", err.response?.data?.error || "Failed to remove document");
        } finally {
          setDeletingId(null);
        }
      }},
    ]);
  };

  const openFile = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open the document"));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>KYC Documents</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{uploadedTypeCount}/{DOC_CONFIG.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>
              🔒 You can upload multiple images per document (e.g. front and back). Documents are reviewed by our
              team as part of the KYC process. Accepted formats: JPG, PNG, PDF — max 5 MB each.
            </Text>
          </View>

          {DOC_CONFIG.map(cfg => {
            const files = docsByType[cfg.type] || [];
            const hasFiles = files.length > 0;
            const isUploading = !!uploading[cfg.type];
            const pct = progress[cfg.type] ?? 0;
            const slot = slotByType[cfg.type] || "Front";

            return (
              <View key={cfg.type} style={styles.docCard}>
                {/* Card header */}
                <View style={styles.docCardHeader}>
                  <View style={[styles.docIcon, { backgroundColor: hasFiles ? "#f0fdf4" : "#f9fafb" }]}>
                    <Text style={styles.docIconEmoji}>{hasFiles ? "📋" : "📄"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.docTitleRow}>
                      <Text style={styles.docTitle}>{cfg.label}</Text>
                      {cfg.required && <View style={styles.reqBadge}><Text style={styles.reqText}>Required</Text></View>}
                    </View>
                    <Text style={styles.docDesc}>{cfg.desc}</Text>
                  </View>
                  {hasFiles && (
                    <View style={styles.fileCountBadge}>
                      <Text style={styles.fileCountText}>{files.length}</Text>
                    </View>
                  )}
                </View>

                {/* Uploaded files */}
                {files.map(doc => {
                  const statusCfg = STATUS_CFG[doc.status || "PENDING"] || STATUS_CFG.PENDING;
                  const isDeleting = deletingId === doc.id;
                  return (
                    <View key={doc.id} style={styles.fileBox}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={styles.fileEmoji}>{doc.mimeType?.includes("pdf") ? "📃" : "🖼️"}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                            {!!doc.label && (
                              <View style={styles.labelChip}><Text style={styles.labelChipText}>{doc.label}</Text></View>
                            )}
                            <Text style={styles.fileName} numberOfLines={1}>{doc.originalName}</Text>
                          </View>
                          <Text style={styles.fileDate}>Uploaded {fmtDate(doc.uploadedAt)}</Text>
                        </View>
                      </View>

                      <View style={styles.fileActionsRow}>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
                          <Text style={[styles.statusBadgeText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
                        </View>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => openFile(doc.fileUrl)}>
                          <Text style={styles.iconBtnText}>👁 View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(doc)} disabled={isDeleting}>
                          {isDeleting
                            ? <ActivityIndicator size="small" color="#dc2626" />
                            : <Text style={[styles.iconBtnText, { color: "#dc2626" }]}>🗑 Remove</Text>}
                        </TouchableOpacity>
                      </View>

                      {doc.status === "REJECTED" && !!doc.rejectionReason && (
                        <View style={styles.rejectionBox}>
                          <Text style={styles.rejectionText}>
                            <Text style={{ fontWeight: "700" }}>Rejected: </Text>{doc.rejectionReason}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Front/Back/Other label picker — only meaningful once adding */}
                {hasFiles && (
                  <View style={styles.slotRow}>
                    {SLOT_LABELS.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.slotPill, slot === s && styles.slotPillActive]}
                        onPress={() => setSlotByType(p => ({ ...p, [cfg.type]: s }))}
                      >
                        <Text style={[styles.slotPillText, slot === s && styles.slotPillTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Upload / add-another zone */}
                <TouchableOpacity
                  style={[hasFiles ? styles.addMoreZone : styles.uploadZone, isUploading && styles.btnDisabled]}
                  onPress={() => handleUpload(cfg.type)}
                  disabled={isUploading}
                >
                  {hasFiles ? (
                    <Text style={styles.addMoreText}>
                      {isUploading ? `Uploading ${pct}%` : "＋ Add another file"}
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.uploadEmoji}>{isUploading ? "⏳" : "⬆️"}</Text>
                      <Text style={styles.uploadText}>{isUploading ? `Uploading… ${pct}%` : "Tap to upload"}</Text>
                      {isUploading && pct > 0 && (
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                        </View>
                      )}
                      {!isUploading && <Text style={styles.uploadHint}>JPG, PNG or PDF — max 5 MB</Text>}
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f9fafb" },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  header:       { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14 },
  backBtn:      { marginRight: 8, padding: 4 },
  backIcon:     { fontSize: 30, color: "#059669", lineHeight: 34 },
  headerTitle:  { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  countBadge:   { backgroundColor: "#f0fdf4", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#bbf7d0" },
  countText:    { fontSize: 12, fontWeight: "700", color: "#059669" },
  content:      { padding: 16, paddingBottom: 40 },

  infoBanner:   { backgroundColor: "#eff6ff", borderRadius: 14, padding: 14, marginBottom: 16 },
  infoText:     { fontSize: 12, color: "#1d4ed8", lineHeight: 18 },

  docCard:      { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#f3f4f6" },
  docCardHeader:{ flexDirection: "row", gap: 12, marginBottom: 14, alignItems: "flex-start" },
  docIcon:      { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docIconEmoji: { fontSize: 22 },
  docTitleRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  docTitle:     { fontSize: 14, fontWeight: "700", color: "#111827" },
  reqBadge:     { backgroundColor: "#fef2f2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  reqText:      { fontSize: 10, color: "#ef4444", fontWeight: "700" },
  docDesc:      { fontSize: 12, color: "#9ca3af", lineHeight: 16 },
  fileCountBadge:{ backgroundColor: "#f3f4f6", borderRadius: 999, minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  fileCountText:{ fontSize: 11, fontWeight: "700", color: "#6b7280" },

  fileBox:      { backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#f3f4f6" },
  fileEmoji:    { fontSize: 22 },
  fileName:     { fontSize: 13, fontWeight: "600", color: "#374151", flexShrink: 1 },
  fileDate:     { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  labelChip:    { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  labelChipText:{ fontSize: 10, fontWeight: "700", color: "#6b7280" },

  fileActionsRow:{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
  statusBadge:  { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText:{ fontSize: 10, fontWeight: "700" },
  iconBtn:      { paddingHorizontal: 4, paddingVertical: 2 },
  iconBtnText:  { fontSize: 12, fontWeight: "600", color: "#374151" },

  rejectionBox: { marginTop: 8, backgroundColor: "#fef2f2", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#fecaca" },
  rejectionText:{ fontSize: 11, color: "#b91c1c", lineHeight: 16 },

  slotRow:      { flexDirection: "row", gap: 8, marginBottom: 10 },
  slotPill:     { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  slotPillActive:{ borderColor: "#059669", backgroundColor: "#f0fdf4" },
  slotPillText: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  slotPillTextActive:{ color: "#059669", fontWeight: "700" },

  uploadZone:   { borderWidth: 2, borderColor: "#e5e7eb", borderStyle: "dashed", borderRadius: 12, paddingVertical: 24, alignItems: "center", gap: 6 },
  uploadEmoji:  { fontSize: 28 },
  uploadText:   { fontSize: 14, fontWeight: "600", color: "#9ca3af" },
  uploadHint:   { fontSize: 12, color: "#d1d5db" },
  progressTrack:{ height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, width: "80%", marginTop: 8, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#059669", borderRadius: 2 },

  addMoreZone:  { borderWidth: 2, borderColor: "#e5e7eb", borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  addMoreText:  { fontSize: 13, fontWeight: "700", color: "#059669" },

  btnDisabled:  { opacity: 0.5 },
});
