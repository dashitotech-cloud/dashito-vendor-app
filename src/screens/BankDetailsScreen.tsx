import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import axios from "axios";
import { api } from "../lib/api";

interface BankAccount {
  accountHolderName: string;
  bankName: string;
  branchName?: string;
  accountNumber: string;
  ifscCode: string;
  accountType: "SAVINGS" | "CURRENT";
  upiId?: string;
  verificationStatus: "VERIFIED" | "PENDING" | "FAILED";
}

interface Props { onBack: () => void }

const STATUS_CONFIG = {
  VERIFIED: { label: "Verified",              emoji: "✅", color: "#16a34a", bg: "#f0fdf4" },
  PENDING:  { label: "Verification Pending",  emoji: "⏳", color: "#d97706", bg: "#fffbeb" },
  FAILED:   { label: "Verification Failed",   emoji: "❌", color: "#dc2626", bg: "#fef2f2" },
};

interface BankForm {
  accountHolderName: string; ifscCode: string; bankName: string; branchName: string;
  city: string; accountNumber: string; confirmAccountNumber: string;
  accountType: "SAVINGS" | "CURRENT"; upiId: string;
}

const EMPTY_FORM: BankForm = {
  accountHolderName: "", ifscCode: "", bankName: "", branchName: "",
  city: "", accountNumber: "", confirmAccountNumber: "", accountType: "SAVINGS", upiId: "",
};

export function BankDetailsScreen({ onBack }: Props) {
  const [bank, setBank]     = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ifscLoading, setIfscLoading]   = useState(false);
  const [ifscFetched, setIfscFetched]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [showAcctNum, setShowAcctNum]         = useState(false);
  const [showConfirmAcctNum, setShowConfirmAcctNum] = useState(false);

  const fetchBank = () => {
    api.get("/vendor/bank").then(r => setBank(r.data.bank || null)).catch(() => setBank(null)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchBank(); }, []);

  const startEdit = () => {
    setForm({
      ...EMPTY_FORM,
      accountHolderName: bank?.accountHolderName || "",
      ifscCode:          bank?.ifscCode          || "",
      bankName:          bank?.bankName          || "",
      branchName:        bank?.branchName        || "",
      accountType:       bank?.accountType       || "SAVINGS",
      upiId:             bank?.upiId             || "",
    });
    setIfscFetched(!!bank?.bankName);
    setErrors({});
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setErrors({}); };

  const set = (key: keyof typeof EMPTY_FORM) => (val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const lookupIfsc = async () => {
    const code = form.ifscCode.trim().toUpperCase();
    if (code.length !== 11) {
      setErrors(e => ({ ...e, ifscCode: "IFSC must be exactly 11 characters" }));
      return;
    }
    setIfscLoading(true);
    setIfscFetched(false);
    try {
      const res = await axios.get(`https://ifsc.razorpay.com/${code}`);
      const info = res.data;
      setForm(f => ({ ...f, bankName: info.BANK || "", branchName: info.BRANCH || "", city: info.CITY || info.CENTRE || "" }));
      setIfscFetched(true);
      setErrors(e => { const n = { ...e }; delete n.ifscCode; return n; });
      Alert.alert("Bank Found", `${info.BANK} — ${info.BRANCH}`);
    } catch {
      setErrors(e => ({ ...e, ifscCode: "Invalid IFSC code. Please check and try again." }));
      setForm(f => ({ ...f, bankName: "", branchName: "", city: "" }));
    } finally {
      setIfscLoading(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.accountHolderName.trim()) e.accountHolderName = "Account holder name is required";
    if (!form.ifscCode.trim())           e.ifscCode = "IFSC code is required";
    else if (!ifscFetched)               e.ifscCode = "Please verify IFSC code first";
    if (!form.bankName.trim())           e.bankName = "Bank name is required — verify IFSC first";
    if (!form.accountNumber.trim())      e.accountNumber = "Account number is required";
    else if (form.accountNumber.trim().length < 8) e.accountNumber = "Account number must be at least 8 digits";
    if (!form.confirmAccountNumber.trim()) e.confirmAccountNumber = "Please confirm account number";
    else if (form.accountNumber.trim() !== form.confirmAccountNumber.trim())
      e.confirmAccountNumber = "Account numbers do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      Alert.alert("Validation Error", "Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      await api.post("/vendor/bank", {
        accountHolderName: form.accountHolderName.trim(),
        bankName:          form.bankName.trim(),
        branchName:        form.branchName.trim() || undefined,
        accountNumber:     form.accountNumber.trim(),
        ifscCode:          form.ifscCode.trim().toUpperCase(),
        accountType:       form.accountType,
        upiId:             form.upiId.trim() || undefined,
      });
      Alert.alert("Saved", "Bank details saved. A penny-drop verification will be initiated within 1–2 business days.");
      setEditing(false);
      fetchBank();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to save bank details");
    } finally {
      setSaving(false);
    }
  };

  const statusCfg = bank ? (STATUS_CONFIG[bank.verificationStatus] || STATUS_CONFIG.PENDING) : STATUS_CONFIG.PENDING;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Bank Details</Text>
        {bank && !editing ? (
          <TouchableOpacity onPress={startEdit}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content}>

            {/* ─ View mode ─ */}
            {!editing && (
              <>
                {!bank ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyEmoji}>🏦</Text>
                    <Text style={styles.emptyTitle}>No bank account added</Text>
                    <Text style={styles.emptyDesc}>
                      Add your bank account to receive weekly settlements. Earnings minus platform commission are transferred every Monday.
                    </Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => setEditing(true)}>
                      <Text style={styles.addBtnText}>+ Add Bank Account</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Status banner */}
                    <View style={[styles.statusBanner, { backgroundColor: statusCfg.bg }]}>
                      <Text style={styles.statusEmoji}>{statusCfg.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                        {bank.verificationStatus === "PENDING"  && <Text style={styles.statusHint}>We verify accounts within 1–2 business days via a penny-drop test.</Text>}
                        {bank.verificationStatus === "VERIFIED" && <Text style={styles.statusHint}>Settlements will be credited to this account.</Text>}
                        {bank.verificationStatus === "FAILED"   && <Text style={styles.statusHint}>Re-check your account details and save again.</Text>}
                      </View>
                    </View>

                    {/* Bank card */}
                    <View style={styles.bankCard}>
                      <Text style={styles.bankName}>{bank.bankName}</Text>
                      {bank.branchName && <Text style={styles.bankBranch}>{bank.branchName}</Text>}

                      <View style={styles.divider} />

                      <InfoRow label="Account Holder" value={bank.accountHolderName} />
                      <InfoRow label="Account No."    value={bank.accountNumber} mono />
                      <InfoRow label="IFSC Code"      value={bank.ifscCode} mono />
                      <InfoRow label="Account Type"   value={bank.accountType === "SAVINGS" ? "Savings Account" : "Current Account"} />
                      {bank.upiId ? <InfoRow label="UPI ID" value={bank.upiId} /> : null}
                    </View>

                    {/* Settlement info */}
                    <View style={styles.infoBox}>
                      <Text style={styles.infoText}>
                        💰 Settlements are processed every Monday for the previous week's earnings (Gross Revenue − Platform Commission). Typically credited within 1–3 business days.
                      </Text>
                    </View>
                  </>
                )}
              </>
            )}

            {/* ─ Edit mode ─ */}
            {editing && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>{bank ? "Update Bank Account" : "Add Bank Account"}</Text>

                <FField label="Account Holder Name *" error={errors.accountHolderName}>
                  <TextInput style={[styles.input, errors.accountHolderName && styles.inputError]}
                    value={form.accountHolderName} onChangeText={set("accountHolderName")}
                    placeholder="As per bank records" placeholderTextColor="#d1d5db" />
                </FField>

                <FField label="IFSC Code *" error={errors.ifscCode}>
                  <View style={styles.ifscRow}>
                    <TextInput style={[styles.input, { flex: 1, letterSpacing: 2 }, errors.ifscCode && styles.inputError]}
                      value={form.ifscCode}
                      onChangeText={v => {
                        set("ifscCode")(v.toUpperCase());
                        setIfscFetched(false);
                        setForm(f => ({ ...f, ifscCode: v.toUpperCase(), bankName: "", branchName: "", city: "" }));
                      }}
                      placeholder="e.g. SBIN0001234" placeholderTextColor="#d1d5db"
                      maxLength={11} autoCapitalize="characters" />
                    <TouchableOpacity
                      style={[styles.verifyBtn, (ifscLoading || form.ifscCode.length !== 11) && styles.verifyBtnDisabled]}
                      onPress={lookupIfsc}
                      disabled={ifscLoading || form.ifscCode.length !== 11}
                    >
                      <Text style={styles.verifyBtnText}>{ifscLoading ? "…" : "Verify"}</Text>
                    </TouchableOpacity>
                  </View>
                  {ifscFetched && form.bankName ? (
                    <View style={styles.bankFoundBox}>
                      <Text style={styles.bankFoundText}>✅ {form.bankName}{form.branchName ? ` — ${form.branchName}` : ""}{form.city ? `, ${form.city}` : ""}</Text>
                    </View>
                  ) : null}
                </FField>

                {/* Account type */}
                <FField label="Account Type *">
                  <View style={styles.typeRow}>
                    {(["SAVINGS", "CURRENT"] as const).map(t => (
                      <TouchableOpacity
                        key={t} style={[styles.typeBtn, form.accountType === t && styles.typeBtnActive]}
                        onPress={() => setForm(f => ({ ...f, accountType: t }))}
                      >
                        <Text style={[styles.typeBtnText, form.accountType === t && styles.typeBtnTextActive]}>
                          {t === "SAVINGS" ? "Savings" : "Current"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </FField>

                <FField label="Account Number *" error={errors.accountNumber}>
                  <View style={styles.acctRow}>
                    <TextInput style={[styles.input, { flex: 1 }, errors.accountNumber && styles.inputError]}
                      value={form.accountNumber} onChangeText={set("accountNumber")}
                      placeholder="Enter account number" placeholderTextColor="#d1d5db"
                      keyboardType="number-pad" secureTextEntry={!showAcctNum} />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowAcctNum(v => !v)}>
                      <Text style={styles.eyeIcon}>{showAcctNum ? "🙈" : "👁️"}</Text>
                    </TouchableOpacity>
                  </View>
                </FField>

                <FField label="Re-enter Account Number *" error={errors.confirmAccountNumber}>
                  <View style={styles.acctRow}>
                    <TextInput style={[styles.input, { flex: 1 }, errors.confirmAccountNumber && styles.inputError]}
                      value={form.confirmAccountNumber} onChangeText={set("confirmAccountNumber")}
                      placeholder="Re-enter to confirm" placeholderTextColor="#d1d5db"
                      keyboardType="number-pad" secureTextEntry={!showConfirmAcctNum}
                      contextMenuHidden
                    />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmAcctNum(v => !v)}>
                      <Text style={styles.eyeIcon}>{showConfirmAcctNum ? "🙈" : "👁️"}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.noPasteHint}>Paste is disabled here — please type it manually to catch typos.</Text>
                </FField>

                <FField label="UPI ID (Optional)">
                  <TextInput style={styles.input}
                    value={form.upiId} onChangeText={set("upiId")}
                    placeholder="e.g. restaurant@upi" placeholderTextColor="#d1d5db"
                    keyboardType="email-address" autoCapitalize="none" />
                </FField>

                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>ℹ️ After saving, a penny-drop verification (₹1 credit) will confirm your account. This typically completes within 1–2 business days.</Text>
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                    onPress={handleSave} disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Bank Details"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={[infoRowStyles.value, mono && { letterSpacing: 1 }]}>{value}</Text>
    </View>
  );
}
const infoRowStyles = StyleSheet.create({
  row:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  label: { fontSize: 12, color: "#9ca3af", fontWeight: "600", flex: 1 },
  value: { fontSize: 13, color: "#111827", fontWeight: "600", textAlign: "right", flex: 2 },
});

function FField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={ffStyles.label}>{label}</Text>
      {children}
      {error ? <Text style={ffStyles.error}>{error}</Text> : null}
    </View>
  );
}
const ffStyles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  error: { fontSize: 12, color: "#ef4444", marginTop: 4 },
});

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#f9fafb" },
  center:         { flex: 1, alignItems: "center", justifyContent: "center" },
  header:         { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14 },
  backBtn:        { marginRight: 8, padding: 4 },
  backIcon:       { fontSize: 30, color: "#059669", lineHeight: 34 },
  headerTitle:    { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  editLink:       { fontSize: 14, fontWeight: "700", color: "#059669" },
  content:        { padding: 16, paddingBottom: 40 },

  emptyCard:      { backgroundColor: "#fff", borderRadius: 16, padding: 28, alignItems: "center", borderWidth: 1, borderColor: "#f3f4f6" },
  emptyEmoji:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:     { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 8, textAlign: "center" },
  emptyDesc:      { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  addBtn:         { backgroundColor: "#059669", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  addBtnText:     { color: "#fff", fontSize: 15, fontWeight: "700" },

  statusBanner:   { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, marginBottom: 14 },
  statusEmoji:    { fontSize: 22, marginTop: 2 },
  statusLabel:    { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  statusHint:     { fontSize: 12, color: "#6b7280" },

  bankCard:       { backgroundColor: "#fff", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 14 },
  bankName:       { fontSize: 17, fontWeight: "800", color: "#111827" },
  bankBranch:     { fontSize: 13, color: "#9ca3af", marginTop: 2 },
  divider:        { height: 1, backgroundColor: "#f3f4f6", marginVertical: 14 },

  infoBox:        { backgroundColor: "#eff6ff", borderRadius: 12, padding: 14, marginBottom: 14 },
  infoText:       { fontSize: 12, color: "#1d4ed8", lineHeight: 18 },

  formCard:       { backgroundColor: "#fff", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#f3f4f6" },
  formTitle:      { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 20 },

  input:          { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827", backgroundColor: "#fff" },
  inputError:     { borderColor: "#ef4444", backgroundColor: "#fef2f2" },
  noPasteHint:    { fontSize: 11, color: "#9ca3af", marginTop: 6 },

  acctRow:        { flexDirection: "row", gap: 8, alignItems: "center" },
  eyeBtn:         { backgroundColor: "#f3f4f6", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center" },
  eyeIcon:        { fontSize: 16 },
  ifscRow:        { flexDirection: "row", gap: 8 },
  verifyBtn:      { backgroundColor: "#059669", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, justifyContent: "center" },
  verifyBtnDisabled: { opacity: 0.5 },
  verifyBtnText:  { color: "#fff", fontWeight: "700", fontSize: 14 },
  bankFoundBox:   { backgroundColor: "#f0fdf4", borderRadius: 10, padding: 10, marginTop: 8 },
  bankFoundText:  { fontSize: 12, color: "#16a34a", fontWeight: "600" },

  typeRow:        { flexDirection: "row", gap: 10 },
  typeBtn:        { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  typeBtnActive:  { borderColor: "#059669", backgroundColor: "#f0fdf4" },
  typeBtnText:    { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  typeBtnTextActive: { color: "#059669" },

  formActions:    { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn:      { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#f3f4f6" },
  cancelBtnText:  { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  saveBtn:        { flex: 2, backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnDisabled:{ opacity: 0.6 },
  saveBtnText:    { color: "#fff", fontSize: 15, fontWeight: "700" },
});
