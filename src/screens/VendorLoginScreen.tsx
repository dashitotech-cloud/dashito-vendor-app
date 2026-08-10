import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image, useWindowDimensions, ScrollView, Linking,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "../lib/api";
import { useVendorStore } from "../store/useVendorStore";

const ONBOARDING_URL = process.env.EXPO_PUBLIC_ONBOARDING_URL || "https://onboarding.dashito.in";
const VENDOR_ROLES = ["VENDOR", "ADMIN", "SUPER_ADMIN"];

type LoginMode = "password" | "forgot" | "reset";
type ForgotStep = "email" | "sent";
type ResetStep = "token" | "done";

function PasswordField({
  label, value, onChangeText, placeholder, secureTextEntry, onToggleSecure,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder: string; secureTextEntry: boolean; onToggleSecure: () => void;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.pwRow}>
        <TextInput
          style={[s.input, { flex: 1, borderWidth: 0 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onToggleSecure} style={s.eyeBtn}>
          <Text style={s.eyeIcon}>{secureTextEntry ? "👁" : "🙈"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function VendorLoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { width } = useWindowDimensions();
  const { setAuth, setRestaurant } = useVendorStore();

  const [mode, setMode]         = useState<LoginMode>("password");

  // Must-change-password gate (after first email+password login)
  const [newPw, setNewPw]       = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [showNewPw, setShowNewPw] = useState(true);

  // Password flow
  const [pwEmail, setPwEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(true);
  const [mustChangePw, setMustChangePw] = useState(false);

  // Forgot flow
  const [forgotStep, setForgotStep]   = useState<ForgotStep>("email");
  const [forgotEmail, setForgotEmail] = useState("");

  // Reset flow (manual token entry — user pastes the token from the emailed link)
  const [resetStep, setResetStep]         = useState<ResetStep>("token");
  const [resetToken, setResetToken]       = useState("");
  const [resetPw, setResetPw]             = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [showResetPw, setShowResetPw]     = useState(true);

  const [loading, setLoading] = useState(false);

  // ── helpers ──────────────────────────────────────────────────────────────

  const finishLogin = async (accessToken: string, refreshToken: string | undefined, user: any) => {
    await SecureStore.setItemAsync("vendor_access_token", accessToken);
    if (refreshToken) await SecureStore.setItemAsync("vendor_refresh_token", refreshToken);
    setAuth(accessToken, user.id, user.restaurantId, user.restaurantName);
    if (user.restaurantId) setRestaurant(user.restaurantId, user.restaurantName, user.storeIsOpen ?? false);
  };

  const switchMode = (m: LoginMode) => {
    setMode(m);
    setForgotStep("email");
    setForgotEmail("");
    setMustChangePw(false);
    setResetStep("token");
    setResetToken("");
    setResetPw("");
    setResetPwConfirm("");
  };

  // ── Set password (after must-change-password gate) ─────────────────────────

  const handleSetPassword = async () => {
    if (newPw.length < 8)        { Alert.alert("Too Short", "Password must be at least 8 characters"); return; }
    if (newPw !== newPwConfirm)  { Alert.alert("Mismatch", "Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/set-password", { password: newPw });
      setMustChangePw(false);
      onLoggedIn();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to set password");
    } finally { setLoading(false); }
  };

  // ── Password login ────────────────────────────────────────────────────────

  const handlePasswordLogin = async () => {
    if (!pwEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pwEmail.trim())) {
      Alert.alert("Invalid Email", "Enter a valid email address"); return;
    }
    if (!password) { Alert.alert("Required", "Enter your password"); return; }
    setLoading(true);
    try {
      const res = await api.post("/auth/vendor/email-login", { email: pwEmail.trim(), password });
      const { accessToken, refreshToken, user } = res.data;
      if (!VENDOR_ROLES.includes(user.role)) {
        Alert.alert("Access Denied", "Vendor accounts only");
        return;
      }
      await finishLogin(accessToken, refreshToken, user);
      if (user.mustChangePassword) {
        setMustChangePw(true);
      } else {
        onLoggedIn();
      }
    } catch (e: any) {
      Alert.alert("Login Failed", e.response?.data?.error || "Invalid email or password");
    } finally { setLoading(false); }
  };

  // ── Forgot password flow ──────────────────────────────────────────────────

  const handleForgotEmail = async () => {
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      Alert.alert("Invalid Email", "Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail });
      setForgotStep("sent");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to send reset email");
    } finally { setLoading(false); }
  };

  // ── Reset password (manual token entry from the emailed link) ──────────────

  const handleResetPassword = async () => {
    if (!resetToken.trim())      { Alert.alert("Required", "Paste the reset code/link from your email"); return; }
    if (resetPw.length < 8)      { Alert.alert("Too Short", "Password must be at least 8 characters"); return; }
    if (resetPw !== resetPwConfirm) { Alert.alert("Mismatch", "Passwords do not match"); return; }
    setLoading(true);
    try {
      // Accept either a bare token or the full emailed URL (?token=...)
      const raw = resetToken.trim();
      const match = raw.match(/[?&]token=([^&\s]+)/);
      const token = match ? decodeURIComponent(match[1]) : raw;
      await api.post("/auth/reset-password", { token, password: resetPw });
      setResetStep("done");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Reset link is invalid or has expired");
    } finally { setLoading(false); }
  };

  const openOnboarding = () => {
    Linking.openURL(ONBOARDING_URL).catch(() =>
      Alert.alert("Error", "Could not open the registration page")
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Brand */}
        <View style={s.brand}>
          <Image
            source={require("../../assets/logo.png")}
            style={{ width: width * 0.58, height: width * 0.2, marginBottom: 10 }}
            resizeMode="contain"
          />
          <View style={s.appBadge}>
            <Text style={s.appBadgeText}>For Restaurants</Text>
          </View>
          <Text style={s.tagline}>Manage your restaurant on the go</Text>
        </View>

        <View style={s.card}>

          {/* ── Must-change-password gate (after first email+password login) ── */}
          {mustChangePw && (
            <>
              <View style={s.infoBanner}>
                <Text style={s.infoIcon}>🔐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoTitle}>Change your password</Text>
                  <Text style={s.infoSub}>For security, please set a new password before continuing.</Text>
                </View>
              </View>
              <PasswordField
                label="New Password" value={newPw} onChangeText={setNewPw}
                placeholder="Min. 8 characters" secureTextEntry={showNewPw}
                onToggleSecure={() => setShowNewPw(v => !v)}
              />
              <PasswordField
                label="Confirm Password" value={newPwConfirm} onChangeText={setNewPwConfirm}
                placeholder="Re-enter password" secureTextEntry={showNewPw}
                onToggleSecure={() => setShowNewPw(v => !v)}
              />
              <TouchableOpacity
                style={[s.btn, (loading || newPw.length < 8 || newPw !== newPwConfirm) && s.btnDisabled]}
                onPress={handleSetPassword}
                disabled={loading || newPw.length < 8 || newPw !== newPwConfirm}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Set Password & Continue</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* ── Password mode ── */}
          {!mustChangePw && mode === "password" && (
            <>
              <Text style={s.cardTitle}>Sign In</Text>
              <Text style={s.cardSub}>Use the email and password sent to you on approval</Text>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>Email Address</Text>
                <TextInput
                  style={s.input}
                  placeholder="you@example.com"
                  value={pwEmail}
                  onChangeText={setPwEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <PasswordField
                label="Password" value={password} onChangeText={setPassword}
                placeholder="Enter your password" secureTextEntry={showPw}
                onToggleSecure={() => setShowPw(v => !v)}
              />
              <TouchableOpacity
                style={s.forgotLink}
                onPress={() => switchMode("forgot")}
              >
                <Text style={s.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, (loading || !pwEmail || !password) && s.btnDisabled]}
                onPress={handlePasswordLogin}
                disabled={loading || !pwEmail || !password}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* ── Forgot mode ── */}
          {!mustChangePw && mode === "forgot" && (
            <>
              <TouchableOpacity style={s.backRow} onPress={() => switchMode("password")}>
                <Text style={s.backText}>‹ Back to Login</Text>
              </TouchableOpacity>
              <Text style={s.cardTitle}>Reset Password</Text>

              {forgotStep === "email" && (
                <>
                  <Text style={s.cardSub}>Enter your registered email address. We&apos;ll send you a link to reset your password.</Text>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Email Address</Text>
                    <TextInput
                      style={s.input}
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor="#9ca3af"
                      onSubmitEditing={handleForgotEmail}
                    />
                  </View>
                  <TouchableOpacity
                    style={[s.btn, (loading || !forgotEmail) && s.btnDisabled]}
                    onPress={handleForgotEmail}
                    disabled={loading || !forgotEmail}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send Reset Link →</Text>}
                  </TouchableOpacity>
                </>
              )}

              {forgotStep === "sent" && (
                <>
                  <View style={s.infoBanner}>
                    <Text style={s.infoIcon}>✉️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.infoTitle}>Check your inbox</Text>
                      <Text style={s.infoSub}>
                        A password reset link has been sent to {forgotEmail}. Open the link on your phone, then come back and paste it below. It expires in 15 minutes.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={[s.btn, { marginBottom: 10 }]} onPress={() => setMode("reset")}>
                    <Text style={s.btnText}>I Have My Reset Link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.skipBtn} onPress={() => switchMode("password")}>
                    <Text style={s.skipText}>← Back to Login</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── Reset mode — paste the token/link from the emailed reset link ── */}
          {!mustChangePw && mode === "reset" && (
            <>
              <TouchableOpacity style={s.backRow} onPress={() => switchMode("forgot")}>
                <Text style={s.backText}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={s.cardTitle}>Set New Password</Text>

              {resetStep === "token" && (
                <>
                  <Text style={s.cardSub}>Paste the reset link or code from your email</Text>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Reset Link / Code</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Paste here"
                      value={resetToken}
                      onChangeText={setResetToken}
                      autoCapitalize="none"
                      placeholderTextColor="#9ca3af"
                      multiline
                    />
                  </View>
                  <PasswordField
                    label="New Password" value={resetPw} onChangeText={setResetPw}
                    placeholder="Min. 8 characters" secureTextEntry={showResetPw}
                    onToggleSecure={() => setShowResetPw(v => !v)}
                  />
                  <PasswordField
                    label="Confirm Password" value={resetPwConfirm} onChangeText={setResetPwConfirm}
                    placeholder="Re-enter password" secureTextEntry={showResetPw}
                    onToggleSecure={() => setShowResetPw(v => !v)}
                  />
                  <TouchableOpacity
                    style={[s.btn, (loading || !resetToken.trim() || resetPw.length < 8 || resetPw !== resetPwConfirm) && s.btnDisabled]}
                    onPress={handleResetPassword}
                    disabled={loading || !resetToken.trim() || resetPw.length < 8 || resetPw !== resetPwConfirm}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Reset Password</Text>}
                  </TouchableOpacity>
                </>
              )}

              {resetStep === "done" && (
                <>
                  <View style={s.infoBanner}>
                    <Text style={s.infoIcon}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.infoTitle}>Password updated</Text>
                      <Text style={s.infoSub}>You can now sign in with your new password.</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={s.btn} onPress={() => switchMode("password")}>
                    <Text style={s.btnText}>Back to Login</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* New vendor entry point — opens the public onboarding form in the browser */}
          {!mustChangePw && mode !== "forgot" && mode !== "reset" && (
            <View style={s.registerRow}>
              <Text style={s.registerText}>New vendor? </Text>
              <TouchableOpacity onPress={openOnboarding}>
                <Text style={s.registerLink}>Register your restaurant</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#ecfdf5" },
  scroll:           { alignItems: "center", justifyContent: "center", padding: 20, flexGrow: 1 },
  brand:            { alignItems: "center", marginBottom: 28 },
  appBadge:         { backgroundColor: "#059669", paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999, marginBottom: 6 },
  appBadgeText:     { fontSize: 12, fontWeight: "700", color: "#fff", letterSpacing: 0.5 },
  tagline:          { fontSize: 13, color: "#065f46", marginTop: 4 },

  card:             { width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 24, elevation: 4 },

  cardTitle:        { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 6 },
  cardSub:          { fontSize: 13, color: "#9ca3af", marginBottom: 20 },

  btn:              { backgroundColor: "#059669", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnDisabled:      { opacity: 0.6 },
  btnText:          { color: "#fff", fontSize: 16, fontWeight: "700" },

  backText:         { fontSize: 14, color: "#059669", fontWeight: "600", marginBottom: 16 },
  backRow:          { marginBottom: 16 },

  // Password field
  fieldWrap:        { marginBottom: 16 },
  fieldLabel:       { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input:            { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: "#111827" },
  pwRow:            { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingLeft: 16 },
  eyeBtn:           { paddingHorizontal: 14, paddingVertical: 14 },
  eyeIcon:          { fontSize: 18 },

  forgotLink:       { alignSelf: "flex-end", marginBottom: 16, marginTop: -8 },
  forgotText:       { fontSize: 13, color: "#059669", fontWeight: "600" },

  skipBtn:          { alignItems: "center", paddingVertical: 12, marginTop: 6 },
  skipText:         { fontSize: 13, color: "#9ca3af" },

  registerRow:      { flexDirection: "row", justifyContent: "center", marginTop: 18 },
  registerText:     { fontSize: 12, color: "#9ca3af" },
  registerLink:     { fontSize: 12, color: "#059669", fontWeight: "700", textDecorationLine: "underline" },

  // Info banner (set-password)
  infoBanner:       { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#f0fdf4", borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: "#bbf7d0" },
  infoIcon:         { fontSize: 22 },
  infoTitle:        { fontSize: 14, fontWeight: "700", color: "#065f46" },
  infoSub:          { fontSize: 12, color: "#4ade80", marginTop: 2 },
});
