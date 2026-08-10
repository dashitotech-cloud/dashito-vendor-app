import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useVendorStore } from "./store/useVendorStore";
import { useThemeStore, useThemeColors } from "./store/useThemeStore";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { VendorLoginScreen } from "./screens/VendorLoginScreen";
import { VendorDashboardScreen } from "./screens/VendorDashboardScreen";
import { IncomingOrdersScreen } from "./screens/IncomingOrdersScreen";
import { MenuManagementScreen } from "./screens/MenuManagementScreen";
import { ScheduleScreen } from "./screens/ScheduleScreen";
import { MoreScreen, type SubScreen } from "./screens/MoreScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { CommissionCalculatorScreen } from "./screens/CommissionCalculatorScreen";
import { OffersScreen } from "./screens/OffersScreen";
import { SubscriptionScreen } from "./screens/SubscriptionScreen";
import { BankDetailsScreen } from "./screens/BankDetailsScreen";
import { DriversScreen } from "./screens/DriversScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { AgreementScreen } from "./screens/AgreementScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ContentPageScreen } from "./screens/ContentPageScreen";
import { TermsGateScreen } from "./screens/TermsGateScreen";
import { NewOrderAlert } from "./components/NewOrderAlert";
import { api } from "./lib/api";
import { getMissingProfileFields } from "./lib/vendorProfile";

type Tab = "dashboard" | "orders" | "menu" | "schedule" | "more";

const TAB_CONFIG: { key: Tab; label: string; emoji: string }[] = [
  { key: "dashboard", label: "Home",     emoji: "🏠" },
  { key: "orders",    label: "Orders",   emoji: "📋" },
  { key: "menu",      label: "Menu",     emoji: "🍽️" },
  { key: "schedule",  label: "Schedule", emoji: "📅" },
  { key: "more",      label: "More",     emoji: "⋯"  },
];

export default function App() {
  const { setAuth, setRestaurant, logout, accessToken } = useVendorStore();
  const hydrateTheme = useThemeStore(s => s.hydrate);
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const [booting, setBooting]           = useState(true);
  const [isLoggedIn, setIsLoggedIn]     = useState(false);
  const [termsRequired, setTermsRequired] = useState(false);
  // Basic-profile-completeness gate — mirrors RequireVendorProfileComplete in
  // apps/admin/src/App.jsx. Takes priority over the terms gate: a vendor with
  // an incomplete profile (only actually happens for "Partner with us"
  // self-signups) is kept on the Settings screen, full-screen, until every
  // required field is filled in — they cannot reach any other tab/screen.
  const [missingProfileFields, setMissingProfileFields] = useState<string[]>([]);
  const [activeTab, setActiveTab]       = useState<Tab>("dashboard");
  const [moreSubScreen, setMoreSubScreen] = useState<SubScreen | null>(null);

  usePushNotifications(isLoggedIn, React.useCallback(() => {
    setMoreSubScreen(null);
    setActiveTab("orders");
  }, []));

  useEffect(() => { bootstrap(); hydrateTheme(); }, []);

  // Fetches the vendor's own restaurant profile and checks it against the
  // same required-field list the admin web app uses, so the mobile app never
  // needs a dedicated backend endpoint for this — GET /vendor/profile already
  // returns the full restaurant row. Non-fatal on error: an unreachable check
  // must never itself lock a vendor out.
  const checkProfileComplete = async (): Promise<boolean> => {
    try {
      const res = await api.get("/vendor/profile");
      const missing = getMissingProfileFields(res.data?.restaurant);
      setMissingProfileFields(missing);
      return missing.length === 0;
    } catch {
      setMissingProfileFields([]);
      return true;
    }
  };

  // Checks if vendor needs to accept terms before accessing the app. Only
  // meaningful once the profile is complete — deferred to after
  // checkProfileComplete() at every call site, mirroring RequireVendorTerms
  // on web deferring to RequireVendorProfileComplete.
  const checkTermsRequired = async () => {
    try {
      const termsRes = await api.get("/terms/my-agreement");
      const { termsAccepted, activeTemplate } = termsRes.data;
      if (!termsAccepted && activeTemplate) setTermsRequired(true);
    } catch { /* non-fatal — skip gate on error */ }
  };

  const bootstrap = async () => {
    try {
      const token = await SecureStore.getItemAsync("vendor_access_token");
      if (!token) { setBooting(false); return; }
      const res = await api.get("/users/me");
      const user = res.data;
      setAuth(token, user.id, user.restaurantId, user.restaurantName);
      if (user.restaurantId) setRestaurant(user.restaurantId, user.restaurantName, Boolean(user.storeIsOpen));
      const profileComplete = await checkProfileComplete();
      if (profileComplete) await checkTermsRequired();
      setIsLoggedIn(true);
    } catch {
      await SecureStore.deleteItemAsync("vendor_access_token");
      await SecureStore.deleteItemAsync("vendor_refresh_token");
    } finally {
      setBooting(false);
    }
  };

  const handleLoggedIn = async () => {
    const profileComplete = await checkProfileComplete();
    if (profileComplete) await checkTermsRequired();
    setIsLoggedIn(true);
  };

  // Called by SettingsScreen once a forced profile-completion save results in
  // zero missing fields — lifts the gate and, mirroring web's post-save
  // behaviour, immediately checks whether the terms gate should take over.
  const handleProfileNowComplete = async () => {
    setMissingProfileFields([]);
    await checkTermsRequired();
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
        await SecureStore.deleteItemAsync("vendor_access_token");
        await SecureStore.deleteItemAsync("vendor_refresh_token");
        logout();
        setIsLoggedIn(false);
        setTermsRequired(false);
        setMissingProfileFields([]);
        setActiveTab("dashboard");
        setMoreSubScreen(null);
      }},
    ]);
  };

  const openMoreSubScreen = (screen: SubScreen) => {
    setMoreSubScreen(screen);
    setActiveTab("more");
  };

  const handleTabPress = (tab: Tab) => {
    if (tab !== "more") setMoreSubScreen(null);
    setActiveTab(tab);
  };

  if (booting) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>;
  }

  if (!isLoggedIn) {
    return <VendorLoginScreen onLoggedIn={handleLoggedIn} />;
  }

  // Higher priority than the terms gate — a vendor can't be asked to sign the
  // agreement before their basic profile even exists. Full-screen takeover,
  // same pattern as the terms gate below: no tab bar, nothing else reachable.
  if (missingProfileFields.length > 0) {
    return (
      <SettingsScreen
        onBack={() => {}}
        onLogout={handleLogout}
        forcedProfileGate
        onProfileComplete={handleProfileNowComplete}
      />
    );
  }

  if (termsRequired) {
    return <TermsGateScreen onAccepted={() => setTermsRequired(false)} />;
  }

  const renderScreen = () => {
    if (activeTab === "more") {
      if (moreSubScreen === "notifications") return <NotificationsScreen onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "analytics")   return <AnalyticsScreen    onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "commissionCalculator") return <CommissionCalculatorScreen onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "offers")      return <OffersScreen       onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "subscription")return <SubscriptionScreen onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "bank")        return <BankDetailsScreen  onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "drivers")     return <DriversScreen      onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "documents")   return <DocumentsScreen    onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "agreement")   return <AgreementScreen    onBack={() => setMoreSubScreen(null)} />;
      if (moreSubScreen === "settings")    return <SettingsScreen     onBack={() => setMoreSubScreen(null)} onLogout={handleLogout} />;
      if (moreSubScreen?.startsWith("content:")) {
        const slug = moreSubScreen.split(":")[1];
        return <ContentPageScreen slug={slug} onBack={() => setMoreSubScreen(null)} />;
      }
      return <MoreScreen onNavigate={(s) => setMoreSubScreen(s)} onLogout={handleLogout} />;
    }
    switch (activeTab) {
      case "dashboard": return (
        <VendorDashboardScreen
          onNavigateToOrders={() => handleTabPress("orders")}
          onNavigateToMenu={() => handleTabPress("menu")}
          onOpenSubScreen={openMoreSubScreen}
        />
      );
      case "orders":   return <IncomingOrdersScreen />;
      case "menu":     return <MenuManagementScreen />;
      case "schedule": return <ScheduleScreen />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Sub-screens under "More" (Notifications, Settings, etc.) already reserve
          their own top inset via a hardcoded paddingTop, since they're full-screen
          takeovers designed before SafeAreaProvider existed — only the 5 tab-bar
          landing screens need insets.top applied here, or they'd get double-padded. */}
      <View style={[styles.content, !(activeTab === "more" && moreSubScreen) && { paddingTop: insets.top }]}>{renderScreen()}</View>

      <View style={[styles.tabBar, { backgroundColor: theme.tabBar, borderTopColor: theme.border, paddingBottom: 4 + insets.bottom }]}>
        {TAB_CONFIG.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={styles.tabItem} onPress={() => handleTabPress(tab.key)}>
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <NewOrderAlert />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f9fafb" },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  content:      { flex: 1 },
  tabBar:       { flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingBottom: 4 },
  tabItem:      { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabEmoji:     { fontSize: 22, marginBottom: 2 },
  tabLabel:     { fontSize: 11, color: "#9ca3af", fontWeight: "500" },
  tabLabelActive:{ color: "#059669", fontWeight: "700" },
  tabIndicator: { position: "absolute", top: 0, left: "25%", right: "25%", height: 2, backgroundColor: "#059669", borderRadius: 1 },
});
