import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, FlatList, Image,
} from "react-native";
import { pickImage } from "../lib/imagePicker";
import { api } from "../lib/api";
import { useThemeStore } from "../store/useThemeStore";
import { getMissingProfileFields } from "../lib/vendorProfile";
import { forwardGeocode } from "../lib/geocoding";

interface Props {
  onBack: () => void;
  onLogout: () => void;
  /** True when App.tsx is force-rendering this screen full-screen because the
   *  vendor's basic profile is incomplete — hides the back button and, once
   *  a save results in zero missing fields, calls onProfileComplete so the
   *  caller can lift the gate. */
  forcedProfileGate?: boolean;
  onProfileComplete?: () => void;
}

const RESTAURANT_TYPES = ["RESTAURANT", "CAFE", "BAKERY", "CLOUD_KITCHEN", "TIFFIN_SERVICE", "SWEET_SHOP", "JUICE_CENTER", "DHABA", "FOOD_TRUCK", "OTHER"];
const CUISINES = ["North Indian", "South Indian", "Chinese", "Italian", "Mexican", "Continental", "Thai", "Fast Food", "Street Food", "Mughlai", "Biryani", "Pizza", "Burger", "Desserts", "Healthy", "Jain", "Other"];
const BUSINESS_TYPES = ["PROPRIETORSHIP", "PARTNERSHIP", "PVT_LTD", "LLP", "OTHER"];
const BUSINESS_LABELS: Record<string, string> = { PROPRIETORSHIP: "Proprietorship", PARTNERSHIP: "Partnership", PVT_LTD: "Private Limited", LLP: "LLP", OTHER: "Other" };
const INDIAN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry"];

type PickerOption = { label: string; value: string };

function parseCuisines(raw: string | null): string[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function buildForm(r: any, u: any) {
  return {
    name:                  r.name              || "",
    displayName:           r.displayName       || "",
    restaurantType:        r.restaurantType    || "",
    cuisineType:           r.cuisineType       || "",
    secondaryCuisines:     parseCuisines(r.secondaryCuisines).filter((c: string) => c !== r.cuisineType),
    description:           r.description       || "",
    isVegOnly:             !!r.isVegOnly,
    isNonVeg:              !!r.isNonVeg,
    supportsJain:          !!r.supportsJain,
    hasSeparateVegKitchen: !!r.hasSeparateVegKitchen,
    contactPersonName:     r.contactPersonName || u?.name  || "",
    contactEmail:          r.contactEmail      || u?.email || "",
    supportPhone:          r.supportPhone      || "",
    outletName:            r.outletName        || "",
    addressLine:           r.addressLine       || "",
    streetLocality:        r.streetLocality    || "",
    city:                  r.city              || "",
    state:                 r.state             || "",
    pincode:               r.pincode           || "",
    landmark:              r.landmark          || "",
    lat:                   r.lat != null ? String(r.lat) : "",
    lng:                   r.lng != null ? String(r.lng) : "",
    serviceRadius:         r.serviceRadius     || "5",
    isGeofenced:           !!r.isGeofenced,
    selfDeliver:           !!r.selfDeliver,
    deliveryBoyCount:      r.deliveryBoyCount  ? String(r.deliveryBoyCount) : "",
    willingForShortDelivery: !!r.willingForShortDelivery,
    legalEntityName:       r.legalEntityName   || "",
    businessType:          r.businessType      || "",
    fssaiNumber:           r.fssaiNumber       || "",
    fssaiExpiry:           r.fssaiExpiry ? String(r.fssaiExpiry).slice(0, 10) : "",
    gstin:                 r.gstin             || "",
    pan:                   r.pan               || "",
  };
}

export function SettingsScreen({ onBack, onLogout, forcedProfileGate, onProfileComplete }: Props) {
  const { dark, toggleDark } = useThemeStore();
  const [profileData, setProfileData]     = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [editing, setEditing]             = useState(false);
  const [form, setForm]                   = useState<Record<string, any>>({});
  const [saving, setSaving]               = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [locating, setLocating] = useState(false);
  const [picker, setPicker]               = useState<{ visible: boolean; field: string; options: PickerOption[] }>({ visible: false, field: "", options: [] });
  const autoEditTriggered = React.useRef(false);

  useEffect(() => {
    api.get("/vendor/profile")
      .then(r => { setProfileData(r.data); setForm(buildForm(r.data.restaurant || {}, r.data.user || {})); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const restaurant = profileData?.restaurant || {};
  const user       = profileData?.user       || {};

  // First load only: if required fields are missing (e.g. a "Partner with
  // us" self-signup that hasn't filled in address/FSSAI/PAN yet), drop the
  // vendor straight into the edit form instead of a mostly-empty read view.
  // Mirrors apps/admin/src/pages/vendor/VendorSettings.jsx.
  useEffect(() => {
    if (autoEditTriggered.current) return;
    if (!profileData) return;
    autoEditTriggered.current = true;
    if (getMissingProfileFields(profileData.restaurant).length > 0) setEditing(true);
  }, [profileData]);

  const missingFields = getMissingProfileFields(restaurant);

  const refreshProfile = async () => {
    try {
      const r = await api.get("/vendor/profile");
      setProfileData(r.data);
      return r.data;
    } catch {
      return null;
    }
  };

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));
  const tog = (key: string) => () => setForm(f => ({ ...f, [key]: !f[key] }));

  const toggleDietary = (key: string) => () => setForm(f => {
    const next = !f[key];
    const upd: any = { ...f, [key]: next };
    if (next && (key === "isVegOnly" || key === "supportsJain")) upd.isNonVeg = false;
    return upd;
  });

  const toggleCuisine = (c: string) => {
    setForm(f => {
      const list: string[] = f.secondaryCuisines || [];
      return { ...f, secondaryCuisines: list.includes(c) ? list.filter((x: string) => x !== c) : [...list, c] };
    });
  };

  const openPicker = (field: string, options: PickerOption[]) => setPicker({ visible: true, field, options });
  const closePicker = () => setPicker(p => ({ ...p, visible: false }));
  const selectOption = (val: string) => {
    setForm(f => ({ ...f, [picker.field]: val }));
    closePicker();
  };

  const handleSave = async () => {
    const missing = getMissingProfileFields(form);
    if (missing.length) {
      Alert.alert("Required fields missing", `Please fill in: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      await api.patch("/vendor/profile", {
        ...form,
        serviceRadius:    parseFloat(form.serviceRadius)    || 5,
        deliveryBoyCount: parseInt(form.deliveryBoyCount)   || undefined,
        lat:              form.lat ? parseFloat(form.lat)   : undefined,
        lng:              form.lng ? parseFloat(form.lng)   : undefined,
      });
      Alert.alert("Saved", "Profile updated successfully");
      setEditing(false);
      const refreshed = await refreshProfile();
      if (refreshed && getMissingProfileFields(refreshed.restaurant).length === 0) {
        onProfileComplete?.();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(buildForm(restaurant, user));
    setEditing(false);
  };

  const handleLogoUpload = async () => {
    try {
      const file = await pickImage({ title: "Update Logo", aspect: [1, 1], maxWidth: 1024 });
      if (!file) return;
      setUploadingLogo(true);
      const fd = new FormData();
      fd.append("logo", { uri: file.uri, name: file.name, type: file.type } as any);
      await api.post("/vendor/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      Alert.alert("Success", "Logo updated successfully");
      api.get("/vendor/profile").then(r => setProfileData(r.data)).catch(() => {});
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  // Resolves the currently-typed address into coordinates + canonical
  // city/state/pincode — mobile has no interactive map/pin-drop, so this is
  // the practical equivalent: type the address, tap to find it. Never
  // overwrites Address Line/Street (a geocoder can't know house/floor
  // numbers); only fills City/State/PIN Code if they're still blank, so it
  // never clobbers something the vendor already typed correctly.
  const handleFindLocation = async () => {
    const query = [form.addressLine, form.streetLocality, form.city, form.state, form.pincode]
      .filter(Boolean).join(", ");
    if (!query.trim()) {
      Alert.alert("Address required", "Enter at least the Address Line before finding your location.");
      return;
    }
    setLocating(true);
    try {
      const result = await forwardGeocode(query, INDIAN_STATES);
      setForm(f => ({
        ...f,
        lat: result.lat || f.lat,
        lng: result.lng || f.lng,
        city:    f.city    || result.city,
        state:   f.state   || result.state,
        pincode: f.pincode || result.pincode,
      }));
      Alert.alert("Location found", result.formattedAddress);
    } catch (err: any) {
      Alert.alert("Not found", err.message || "Could not find that address. Please check it and try again, or enter coordinates manually.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {!forcedProfileGate ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        ) : (
          <View style={[styles.backBtn, { width: 30 }]} />
        )}
        <Text style={styles.headerTitle}>{forcedProfileGate ? "Complete Your Profile" : "Settings"}</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content}>

            {missingFields.length > 0 && (
              <View style={styles.missingBanner}>
                <Text style={styles.missingBannerIcon}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.missingBannerTitle}>Complete your profile to continue</Text>
                  <Text style={styles.missingBannerText}>
                    You need to fill in the following before you can access your vendor agreement and dashboard: {missingFields.join(", ")}.
                  </Text>
                </View>
              </View>
            )}

            {/* Profile avatar / logo + name */}
            <View style={styles.avatarCard}>
              <TouchableOpacity onPress={handleLogoUpload} disabled={uploadingLogo} style={styles.avatarWrap}>
                {restaurant.logoUrl ? (
                  <Image source={{ uri: restaurant.logoUrl }} style={styles.logoImage} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>{(restaurant.name || user.name || "V").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  {uploadingLogo
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.cameraIcon}>📷</Text>}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.vendorName}>{restaurant.name || user.name || "Vendor"}</Text>
                <View style={styles.vendorBadge}><Text style={styles.vendorBadgeText}>VENDOR</Text></View>
                {user.phone ? <Text style={styles.vendorPhone}>📱 +91 {user.phone}</Text> : null}
                {restaurant.restaurantCode ? (
                  <View style={styles.restaurantCodeChip}>
                    <Text style={styles.restaurantCodeText}>{restaurant.restaurantCode}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {!editing ? (
              /* ── Read view ── */
              <>
                <Section title="Basic Details">
                  <RField label="Restaurant Name"  value={restaurant.name} />
                  <RField label="Display Name"     value={restaurant.displayName} />
                  <RField label="Restaurant Type"  value={restaurant.restaurantType} />
                  <RField label="Primary Cuisine"  value={restaurant.cuisineType} />
                  {parseCuisines(restaurant.secondaryCuisines).filter((c: string) => c !== restaurant.cuisineType).length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.rLabel}>Secondary Cuisines</Text>
                      <View style={styles.pillRow}>
                        {parseCuisines(restaurant.secondaryCuisines).filter((c: string) => c !== restaurant.cuisineType).map((c: string) => (
                          <View key={c} style={styles.pill}><Text style={styles.pillText}>{c}</Text></View>
                        ))}
                      </View>
                    </View>
                  )}
                  {restaurant.description ? <RField label="Description" value={restaurant.description} /> : null}
                  <View style={styles.pillRow}>
                    {restaurant.isVegOnly && <View style={[styles.pill, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}><Text style={{ color: "#16a34a", fontSize: 12, fontWeight: "600" }}>Pure Veg</Text></View>}
                    {restaurant.isNonVeg  && <View style={[styles.pill, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}><Text style={{ color: "#dc2626", fontSize: 12, fontWeight: "600" }}>Non Veg</Text></View>}
                    {restaurant.supportsJain && <View style={[styles.pill, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}><Text style={{ color: "#d97706", fontSize: 12, fontWeight: "600" }}>Jain Options</Text></View>}
                  </View>
                </Section>

                <Section title="Contact Details">
                  <RField label="Contact Person" value={restaurant.contactPersonName} />
                  <RField label="Contact Phone"  value={restaurant.contactPhone ? `+91 ${restaurant.contactPhone}` : undefined}
                    verified={restaurant.contactPhone ? !!restaurant.contactPhoneVerified : undefined} />
                  <RField label="Contact Email"  value={restaurant.contactEmail}
                    verified={restaurant.contactEmail ? !!restaurant.contactEmailVerified : undefined} />
                  <EmailVerifyWidget
                    email={restaurant.contactEmail}
                    verified={!!restaurant.contactEmailVerified}
                    onVerified={refreshProfile}
                  />
                  <RField label="Support Phone"  value={restaurant.supportPhone ? `+91 ${restaurant.supportPhone}` : undefined} />
                </Section>

                <Section title="Location & Address">
                  <RField label="Address"        value={restaurant.addressLine} />
                  <RField label="Street / Area"  value={restaurant.streetLocality} />
                  <RField label="City"           value={restaurant.city} />
                  <RField label="State"          value={restaurant.state} />
                  <RField label="PIN Code"       value={restaurant.pincode} />
                  <RField label="Landmark"       value={restaurant.landmark} />
                  <RField label="Service Radius" value={restaurant.serviceRadius ? `${restaurant.serviceRadius} km` : undefined} />
                  {(restaurant.lat != null && restaurant.lat !== "") ? <RField label="Latitude"  value={String(restaurant.lat)} /> : null}
                  {(restaurant.lng != null && restaurant.lng !== "") ? <RField label="Longitude" value={String(restaurant.lng)} /> : null}
                  <View style={styles.pillRow}>
                    <View style={[styles.pill, { backgroundColor: restaurant.isGeofenced ? "#fff7ed" : "#f3f4f6", borderColor: restaurant.isGeofenced ? "#fed7aa" : "#e5e7eb" }]}>
                      <Text style={{ color: restaurant.isGeofenced ? "#ea580c" : "#9ca3af", fontSize: 12, fontWeight: "600" }}>
                        {restaurant.isGeofenced ? "Geo-Fencing ✓" : "Geo-Fencing ✗"}
                      </Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: restaurant.selfDeliver ? "#f0fdf4" : "#f3f4f6", borderColor: restaurant.selfDeliver ? "#bbf7d0" : "#e5e7eb" }]}>
                      <Text style={{ color: restaurant.selfDeliver ? "#16a34a" : "#9ca3af", fontSize: 12, fontWeight: "600" }}>
                        {restaurant.selfDeliver ? "Self Delivery ✓" : "No Self Delivery"}
                      </Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: restaurant.willingForShortDelivery ? "#f0fdf4" : "#f3f4f6", borderColor: restaurant.willingForShortDelivery ? "#bbf7d0" : "#e5e7eb" }]}>
                      <Text style={{ color: restaurant.willingForShortDelivery ? "#16a34a" : "#9ca3af", fontSize: 12, fontWeight: "600" }}>
                        {restaurant.willingForShortDelivery ? "2 km Delivery ✓" : "2 km Delivery ✗"}
                      </Text>
                    </View>
                  </View>
                </Section>

                <Section title="Legal & Compliance">
                  <RField label="Legal Entity"   value={restaurant.legalEntityName} />
                  <RField label="Business Type"  value={restaurant.businessType ? BUSINESS_LABELS[restaurant.businessType] : undefined} />
                  <RField label="FSSAI Number"   value={restaurant.fssaiNumber} mono />
                  <RField label="FSSAI Expiry"   value={restaurant.fssaiExpiry ? String(restaurant.fssaiExpiry).slice(0, 10) : undefined} />
                  <RField label="PAN Number"     value={restaurant.pan} mono />
                  <RField label="GSTIN"          value={restaurant.gstin} mono />
                </Section>

                <Section title="Account Info">
                  {restaurant.restaurantCode ? (
                    <RField label="Restaurant ID" value={restaurant.restaurantCode} mono />
                  ) : null}
                  <RField label="Avg Rating"      value={restaurant.avgRating ? `${parseFloat(restaurant.avgRating).toFixed(1)} / 5.0` : undefined} />
                  <RField label="Commission Rate" value={restaurant.commissionRate != null ? `${Math.round(restaurant.commissionRate * 100)}%` : undefined} />
                </Section>
              </>
            ) : (
              /* ── Edit form ── */
              <>
                <Section title="Basic Details">
                  <FField label="Restaurant Name *">
                    <TextInput style={styles.input} value={form.name} onChangeText={set("name")} placeholder="e.g. Spice Garden" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="Display Name">
                    <TextInput style={styles.input} value={form.displayName} onChangeText={set("displayName")} placeholder="Public-facing name (optional)" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="Restaurant Type">
                    <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker("restaurantType", RESTAURANT_TYPES.map(t => ({ label: t.replace(/_/g, " "), value: t })))}>
                      <Text style={form.restaurantType ? styles.selectVal : styles.selectPlaceholder}>{form.restaurantType ? form.restaurantType.replace(/_/g, " ") : "Select type…"}</Text>
                      <Text style={styles.selectChev}>›</Text>
                    </TouchableOpacity>
                  </FField>
                  <FField label="Primary Cuisine">
                    <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker("cuisineType", CUISINES.map(c => ({ label: c, value: c })))}>
                      <Text style={form.cuisineType ? styles.selectVal : styles.selectPlaceholder}>{form.cuisineType || "Select cuisine…"}</Text>
                      <Text style={styles.selectChev}>›</Text>
                    </TouchableOpacity>
                  </FField>
                  <FField label="Secondary Cuisines">
                    <View style={styles.pillSelector}>
                      {CUISINES.filter(c => c !== form.cuisineType).map(c => {
                        const sel = (form.secondaryCuisines || []).includes(c);
                        return (
                          <TouchableOpacity key={c} onPress={() => toggleCuisine(c)}
                            style={[styles.selPill, sel && styles.selPillActive]}>
                            <Text style={[styles.selPillText, sel && styles.selPillTextActive]}>{c}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </FField>
                  <FField label="Description">
                    <TextInput style={[styles.input, styles.textarea]} value={form.description} onChangeText={set("description")} placeholder="Brief description…" placeholderTextColor="#d1d5db" multiline numberOfLines={3} />
                  </FField>
                  <FField label="Dietary Flags">
                    <View style={styles.toggleCol}>
                      <TogRow label="Pure Veg"             val={form.isVegOnly}             onToggle={toggleDietary("isVegOnly")} />
                      <TogRow label="Non Veg"              val={form.isNonVeg}              onToggle={toggleDietary("isNonVeg")} disabled={form.isVegOnly || form.supportsJain} />
                      <TogRow label="Jain Options"         val={form.supportsJain}          onToggle={toggleDietary("supportsJain")} />
                      <TogRow label="Separate Veg Kitchen" val={form.hasSeparateVegKitchen} onToggle={tog("hasSeparateVegKitchen")} />
                    </View>
                  </FField>
                </Section>

                <Section title="Contact Details">
                  <FField label="Contact Person Name *">
                    <TextInput style={styles.input} value={form.contactPersonName} onChangeText={set("contactPersonName")} placeholder="Owner / Manager name" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="Contact Phone">
                    <View style={styles.readOnlyRow}>
                      <Text style={styles.readOnlyText}>{restaurant.contactPhone ? `+91 ${restaurant.contactPhone}` : "—"}</Text>
                    </View>
                    <Text style={styles.fieldHint}>Phone number cannot be changed here</Text>
                  </FField>
                  <FField label="Contact Email">
                    <TextInput style={styles.input} value={form.contactEmail} onChangeText={set("contactEmail")} placeholder="restaurant@example.com" placeholderTextColor="#d1d5db" keyboardType="email-address" autoCapitalize="none" />
                    {!restaurant.contactEmailVerified && restaurant.contactEmail && (
                      form.contactEmail === restaurant.contactEmail ? (
                        <EmailVerifyWidget
                          email={restaurant.contactEmail}
                          verified={false}
                          onVerified={refreshProfile}
                        />
                      ) : (
                        <Text style={styles.fieldHint}>Save your changes to verify this email address</Text>
                      )
                    )}
                  </FField>
                  <FField label="Support Phone">
                    <TextInput style={styles.input} value={form.supportPhone} onChangeText={v => setForm(f => ({ ...f, supportPhone: v.replace(/\D/g, "") }))} placeholder="10-digit support number" placeholderTextColor="#d1d5db" keyboardType="phone-pad" maxLength={10} />
                  </FField>
                </Section>

                <Section title="Location & Address">
                  <FField label="Outlet / Branch Name">
                    <TextInput style={styles.input} value={form.outletName} onChangeText={set("outletName")} placeholder="e.g. Koramangala Branch" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="Address Line *">
                    <TextInput style={styles.input} value={form.addressLine} onChangeText={set("addressLine")} placeholder="House / Shop no., Building" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="Street / Locality / Area">
                    <TextInput style={styles.input} value={form.streetLocality} onChangeText={set("streetLocality")} placeholder="Street name, area" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="City *">
                    <TextInput style={styles.input} value={form.city} onChangeText={set("city")} placeholder="e.g. Bangalore" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="State">
                    <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker("state", INDIAN_STATES.map(s => ({ label: s, value: s })))}>
                      <Text style={form.state ? styles.selectVal : styles.selectPlaceholder}>{form.state || "Select state…"}</Text>
                      <Text style={styles.selectChev}>›</Text>
                    </TouchableOpacity>
                  </FField>
                  <FField label="PIN Code *">
                    <TextInput style={styles.input} value={form.pincode} onChangeText={v => setForm(f => ({ ...f, pincode: v.replace(/\D/g, "") }))} placeholder="6-digit PIN code" placeholderTextColor="#d1d5db" keyboardType="number-pad" maxLength={6} />
                  </FField>
                  <FField label="Landmark">
                    <TextInput style={styles.input} value={form.landmark} onChangeText={set("landmark")} placeholder="Near metro / landmark" placeholderTextColor="#d1d5db" />
                  </FField>
                  <TouchableOpacity style={styles.findLocationBtn} onPress={handleFindLocation} disabled={locating}>
                    {locating
                      ? <ActivityIndicator size="small" color="#059669" />
                      : <Text style={styles.findLocationText}>📍  Find coordinates from address</Text>}
                  </TouchableOpacity>
                  <Text style={styles.fieldHint}>Fills Latitude/Longitude (and City/State/PIN Code if blank) from the address above.</Text>
                  <View style={styles.row2}>
                    <View style={{ flex: 1 }}>
                      <FField label="Latitude">
                        <TextInput style={styles.input} value={form.lat} onChangeText={set("lat")} keyboardType="numbers-and-punctuation" placeholder="e.g. 12.9716" placeholderTextColor="#d1d5db" />
                      </FField>
                    </View>
                    <View style={{ flex: 1 }}>
                      <FField label="Longitude">
                        <TextInput style={styles.input} value={form.lng} onChangeText={set("lng")} keyboardType="numbers-and-punctuation" placeholder="e.g. 77.5946" placeholderTextColor="#d1d5db" />
                      </FField>
                    </View>
                  </View>
                  <FField label="Service Radius (km)">
                    <TextInput style={styles.input} value={String(form.serviceRadius)} onChangeText={set("serviceRadius")} keyboardType="decimal-pad" placeholder="5" placeholderTextColor="#d1d5db" />
                  </FField>
                  <TogRow label="Enable Geo-Fencing" val={form.isGeofenced} onToggle={tog("isGeofenced")} />
                  <View style={{ height: 12 }} />
                  <TogRow label="Self Deliver" val={form.selfDeliver} onToggle={() => setForm(f => ({ ...f, selfDeliver: !f.selfDeliver }))} />
                  {form.selfDeliver && (
                    <FField label="Number of Delivery Boys">
                      <TextInput style={styles.input} value={form.deliveryBoyCount} onChangeText={v => setForm(f => ({ ...f, deliveryBoyCount: v.replace(/\D/g, "") }))} keyboardType="number-pad" placeholder="e.g. 3" placeholderTextColor="#d1d5db" />
                    </FField>
                  )}
                  <TogRow label="Willing for 2 km Delivery" val={form.willingForShortDelivery} onToggle={tog("willingForShortDelivery")} />
                </Section>

                <Section title="Legal & Compliance">
                  <FField label="Legal Entity Name *">
                    <TextInput style={styles.input} value={form.legalEntityName} onChangeText={set("legalEntityName")} placeholder="Registered business name" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="Business Type *">
                    <View style={styles.pillSelector}>
                      {BUSINESS_TYPES.map(bt => {
                        const sel = form.businessType === bt;
                        return (
                          <TouchableOpacity key={bt} onPress={() => setForm(f => ({ ...f, businessType: bt }))}
                            style={[styles.selPill, sel && styles.selPillActive]}>
                            <Text style={[styles.selPillText, sel && styles.selPillTextActive]}>{BUSINESS_LABELS[bt]}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </FField>
                  <FField label="FSSAI License Number *">
                    <TextInput style={styles.input} value={form.fssaiNumber} onChangeText={set("fssaiNumber")} placeholder="14-digit FSSAI number" placeholderTextColor="#d1d5db" keyboardType="number-pad" maxLength={14} />
                  </FField>
                  <FField label="FSSAI Expiry Date (YYYY-MM-DD)">
                    <TextInput style={styles.input} value={form.fssaiExpiry} onChangeText={set("fssaiExpiry")} placeholder="e.g. 2026-12-31" placeholderTextColor="#d1d5db" />
                  </FField>
                  <FField label="PAN Number *">
                    <TextInput style={styles.input} value={form.pan} onChangeText={v => setForm(f => ({ ...f, pan: v.toUpperCase() }))} placeholder="e.g. ABCDE1234F" placeholderTextColor="#d1d5db" maxLength={10} autoCapitalize="characters" />
                  </FField>
                  <FField label="GSTIN (Optional)">
                    <TextInput style={styles.input} value={form.gstin} onChangeText={v => setForm(f => ({ ...f, gstin: v.toUpperCase() }))} placeholder="e.g. 29ABCDE1234F1Z5" placeholderTextColor="#d1d5db" maxLength={15} autoCapitalize="characters" />
                  </FField>
                </Section>

                {/* Save / Cancel */}
                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Changes"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Preferences — always visible */}
            <Section title="Preferences">
              <View style={styles.prefRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefLabel}>{dark ? "🌙" : "☀️"}  Dark Mode</Text>
                  <Text style={styles.prefHint}>Switch between light and dark theme</Text>
                </View>
                <Switch value={dark} onValueChange={toggleDark} trackColor={{ true: "#059669", false: "#e5e7eb" }} thumbColor="#fff" />
              </View>
            </Section>

            {/* Logout — always visible */}
            <View style={styles.dangerZone}>
              <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert("Sign Out", "Are you sure you want to sign out?", [{ text: "Cancel", style: "cancel" }, { text: "Sign Out", style: "destructive", onPress: onLogout }])}>
                <Text style={styles.logoutText}>🚪  Sign Out</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Generic picker modal */}
      <Modal visible={picker.visible} transparent animationType="slide" onRequestClose={closePicker}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={closePicker}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <FlatList
              data={picker.options}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.pickerOption, form[picker.field] === item.value && styles.pickerOptionActive]} onPress={() => selectOption(item.value)}>
                  <Text style={[styles.pickerOptionText, form[picker.field] === item.value && styles.pickerOptionTextActive]}>{item.label}</Text>
                  {form[picker.field] === item.value && <Text style={{ color: "#059669" }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* Inline "Verify email" flow for the Contact Email field — send OTP / enter
   6-digit code / verify. Mirrors apps/admin/src/pages/vendor/VendorSettings.jsx's
   EmailVerifyWidget (same endpoints, same 60s resend cooldown). Always acts on
   the vendor's currently-SAVED contact email — the caller only renders this
   when the displayed email matches what's actually on file. */
function EmailVerifyWidget({ email, verified, onVerified }: { email?: string; verified: boolean; onVerified: () => void }) {
  const [sent, setSent]           = useState(false);
  const [otp, setOtp]             = useState("");
  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError]         = useState("");
  const [cooldown, setCooldown]   = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (verified || !email) return null;

  const sendOtp = async () => {
    setSending(true); setError("");
    try {
      await api.post("/vendor/send-email-otp");
      setSent(true);
      setCooldown(60);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to send OTP. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { setError("Enter the 6-digit OTP"); return; }
    setVerifying(true); setError("");
    try {
      await api.post("/vendor/verify-email-otp", { otp: otp.trim() });
      setSent(false);
      setOtp("");
      onVerified();
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid OTP. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={evStyles.wrap}>
      {!sent ? (
        <TouchableOpacity onPress={sendOtp} disabled={sending}>
          <Text style={evStyles.linkText}>{sending ? "Sending…" : "✉️  Verify email"}</Text>
        </TouchableOpacity>
      ) : (
        <View style={evStyles.row}>
          <TextInput
            style={evStyles.otpInput}
            value={otp}
            onChangeText={t => { setOtp(t.replace(/\D/g, "").slice(0, 6)); setError(""); }}
            placeholder="6-digit OTP"
            placeholderTextColor="#d1d5db"
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            onPress={verifyOtp}
            disabled={otp.length !== 6 || verifying}
            style={[evStyles.verifyBtn, (otp.length !== 6 || verifying) && { opacity: 0.5 }]}
          >
            {verifying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={evStyles.verifyBtnText}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={sendOtp} disabled={sending || cooldown > 0}>
            <Text style={evStyles.resendText}>{cooldown > 0 ? `Resend ${cooldown}s` : "Resend"}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!error && <Text style={evStyles.errorText}>{error}</Text>}
    </View>
  );
}
const evStyles = StyleSheet.create({
  wrap:       { marginTop: 6 },
  linkText:   { fontSize: 12, fontWeight: "700", color: "#059669" },
  row:        { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  otpInput:   { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: "700", letterSpacing: 2, textAlign: "center", width: 110, color: "#111827" },
  verifyBtn:  { backgroundColor: "#059669", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  verifyBtnText:{ color: "#fff", fontSize: 12, fontWeight: "700" },
  resendText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
  errorText:  { fontSize: 11, color: "#ef4444", marginTop: 4 },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={secStyles.card}>
      <Text style={secStyles.title}>{title}</Text>
      {children}
    </View>
  );
}
const secStyles = StyleSheet.create({
  card:  { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#f3f4f6" },
  title: { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 },
});

function RField({ label, value, mono, verified }: { label: string; value?: string; mono?: boolean; verified?: boolean }) {
  if (!value) return null;
  return (
    <View style={rfStyles.row}>
      <Text style={rfStyles.label}>{label}</Text>
      <View style={rfStyles.valueRow}>
        <Text style={[rfStyles.value, mono && { letterSpacing: 1 }]}>{value}</Text>
        {verified !== undefined && (
          verified ? (
            <View style={rfStyles.verifiedBadge}><Text style={rfStyles.verifiedBadgeText}>✓ Verified</Text></View>
          ) : (
            <View style={rfStyles.pendingBadge}><Text style={rfStyles.pendingBadgeText}>Pending</Text></View>
          )
        )}
      </View>
    </View>
  );
}
const rfStyles = StyleSheet.create({
  row:   { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  label: { fontSize: 11, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  value: { fontSize: 14, color: "#111827", fontWeight: "500" },
  verifiedBadge:     { backgroundColor: "#f0fdf4", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  verifiedBadgeText: { fontSize: 11, fontWeight: "700", color: "#16a34a" },
  pendingBadge:      { backgroundColor: "#f3f4f6", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pendingBadgeText:  { fontSize: 11, fontWeight: "600", color: "#9ca3af" },
});

function FField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={ffStyles.label}>{label}</Text>
      {children}
    </View>
  );
}
const ffStyles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
});

function TogRow({ label, val, onToggle, disabled }: { label: string; val: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <View style={togStyles.row}>
      <Text style={[togStyles.label, disabled && { color: "#d1d5db" }]}>{label}</Text>
      <Switch value={val} onValueChange={disabled ? undefined : onToggle} disabled={disabled}
        trackColor={{ true: "#059669", false: "#e5e7eb" }} thumbColor="#fff" />
    </View>
  );
}
const togStyles = StyleSheet.create({
  row:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  label: { fontSize: 14, color: "#374151", flex: 1 },
});

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f9fafb" },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  header:       { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14 },
  backBtn:      { marginRight: 8, padding: 4 },
  backIcon:     { fontSize: 30, color: "#059669", lineHeight: 34 },
  headerTitle:  { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  editLink:     { fontSize: 14, fontWeight: "700", color: "#059669" },
  content:      { padding: 16, paddingBottom: 40 },

  missingBanner:     { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#fffbeb", borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#fde68a" },
  missingBannerIcon: { fontSize: 18 },
  missingBannerTitle:{ fontSize: 13, fontWeight: "700", color: "#92400e" },
  missingBannerText: { fontSize: 12, color: "#b45309", marginTop: 2, lineHeight: 17 },

  avatarCard:   { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#f3f4f6" },
  avatarWrap:   { position: "relative", width: 56, height: 56 },
  avatar:       { width: 56, height: 56, borderRadius: 16, backgroundColor: "#f97316", alignItems: "center", justifyContent: "center" },
  logoImage:    { width: 56, height: 56, borderRadius: 16, resizeMode: "cover" },
  avatarLetter: { fontSize: 24, fontWeight: "900", color: "#fff" },
  cameraOverlay:{ position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: "#059669", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  cameraIcon:   { fontSize: 10 },
  vendorName:   { fontSize: 17, fontWeight: "800", color: "#111827" },
  vendorBadge:  { backgroundColor: "#fff7ed", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginTop: 4 },
  vendorBadgeText:{ fontSize: 10, fontWeight: "700", color: "#f97316", letterSpacing: 0.5 },
  vendorPhone:  { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  restaurantCodeChip: { marginTop: 6, backgroundColor: "#fff7ed", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", borderWidth: 1, borderColor: "#fed7aa" },
  restaurantCodeText: { fontSize: 11, fontWeight: "700", color: "#ea580c", fontFamily: "monospace", letterSpacing: 0.5 },

  rLabel:       { fontSize: 11, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  pillRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  pill:         { backgroundColor: "#f0fdf4", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#bbf7d0" },
  pillText:     { fontSize: 12, color: "#059669", fontWeight: "600" },

  input:        { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#111827" },
  textarea:     { minHeight: 80, textAlignVertical: "top" },
  row2:         { flexDirection: "row", gap: 10 },
  readOnlyRow:  { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f9fafb" },
  readOnlyText: { fontSize: 14, color: "#6b7280" },
  fieldHint:    { fontSize: 11, color: "#9ca3af", marginTop: 4 },

  findLocationBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", borderRadius: 12, paddingVertical: 12, marginBottom: 4 },
  findLocationText: { fontSize: 13, fontWeight: "700", color: "#059669" },

  selectBtn:    { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  selectVal:    { flex: 1, fontSize: 14, color: "#111827" },
  selectPlaceholder: { flex: 1, fontSize: 14, color: "#d1d5db" },
  selectChev:   { fontSize: 20, color: "#9ca3af" },

  pillSelector: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selPill:      { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  selPillActive:{ borderColor: "#059669", backgroundColor: "#f0fdf4" },
  selPillText:  { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  selPillTextActive: { color: "#059669", fontWeight: "700" },

  toggleCol:    { gap: 4 },

  formActions:  { flexDirection: "row", gap: 12, marginBottom: 14 },
  cancelBtn:    { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#f3f4f6" },
  cancelBtnText:{ fontSize: 15, fontWeight: "600", color: "#6b7280" },
  saveBtn:      { flex: 2, backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnDisabled:  { opacity: 0.6 },
  saveBtnText:  { color: "#fff", fontSize: 15, fontWeight: "700" },

  prefRow:      { flexDirection: "row", alignItems: "center" },
  prefLabel:    { fontSize: 14, fontWeight: "600", color: "#374151" },
  prefHint:     { fontSize: 12, color: "#9ca3af", marginTop: 2 },

  dangerZone:   { marginTop: 8 },
  logoutBtn:    { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: "#fee2e2", alignItems: "center" },
  logoutText:   { fontSize: 15, fontWeight: "700", color: "#ef4444" },

  pickerOverlay:{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerSheet:  { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "60%", paddingTop: 12 },
  pickerHandle: { width: 40, height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  pickerOption: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  pickerOptionActive: { backgroundColor: "#f0fdf4" },
  pickerOptionText: { fontSize: 15, color: "#374151" },
  pickerOptionTextActive: { color: "#059669", fontWeight: "700" },
});
