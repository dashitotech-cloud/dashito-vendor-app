import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  ScrollView, TextInput, Switch, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { api } from "../lib/api";
import { isValidIsoDate, isIsoDateBefore } from "../lib/dateValidation";

interface Offer {
  id: string; offerType: string; title: string; bannerText?: string;
  description?: string; discountType?: string; discountValue?: number;
  maxDiscount?: number; minOrderValue?: number; applicableItemIds?: string;
  buyItemId?: string; buyQty?: number; getItemId?: string; getQty?: number;
  comboItems?: string; comboPrice?: number; validFrom: string; validUntil: string;
  maxUsesTotal?: number; maxUsesPerUser?: number; applicableDays?: string;
  startTime?: string; endTime?: string; isFirstOrderOnly?: boolean;
  isAutoApply?: boolean; isActive: boolean; usedCount?: number;
}
interface MenuItem { id: string; name: string; basePrice: number }
interface Props { onBack: () => void }

const TYPE_CFG: Record<string, { label: string; emoji: string; desc: string; color: string }> = {
  ORDER_DISCOUNT: { label: "Order Discount",  emoji: "💯", desc: "% or flat off on total order",                    color: "#f97316" },
  ITEM_DISCOUNT:  { label: "Item Discount",   emoji: "🏷️",  desc: "Discount on specific menu items",                color: "#3b82f6" },
  BOGO:           { label: "Buy X Get Y",     emoji: "🎁", desc: "Buy N items, get M items free",                  color: "#8b5cf6" },
  FREE_ITEM:      { label: "Free Item",       emoji: "🆓", desc: "Complimentary item above a threshold",            color: "#ec4899" },
  COMBO:          { label: "Value Combo",     emoji: "📦", desc: "Bundle of items at one special price",            color: "#10b981" },
  HAPPY_HOURS:    { label: "Happy Hours",     emoji: "⏰", desc: "Time-limited discount on order totals",           color: "#f59e0b" },
};
const DAYS_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const STATUS_TABS = ["all", "active", "scheduled", "inactive", "expired"] as const;
type StatusTab = typeof STATUS_TABS[number];

function parseJSON(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function getStatus(o: Offer): string {
  const now = Date.now();
  const from  = new Date(o.validFrom).getTime();
  const until = new Date(o.validUntil).getTime();
  if (!o.isActive) return "inactive";
  if (now < from)  return "scheduled";
  if (now > until) return "expired";
  return "active";
}

function fmtDate(dt: string) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function discountSummary(o: Offer) {
  const min = (o.minOrderValue ?? 0) > 0 ? ` on orders ₹${o.minOrderValue}+` : "";
  switch (o.offerType) {
    case "ORDER_DISCOUNT": case "ITEM_DISCOUNT": case "HAPPY_HOURS":
      if (o.discountType === "PERCENT") return `${o.discountValue}% off${o.maxDiscount ? ` (max ₹${o.maxDiscount})` : ""}${min}`;
      return `₹${o.discountValue} off${min}`;
    case "BOGO":      return `Buy ${o.buyQty}, get ${o.getQty} free${min}`;
    case "FREE_ITEM": return `Free item (${o.getQty}x)${min}`;
    case "COMBO":     return `Bundle at ₹${o.comboPrice}`;
    default:          return "—";
  }
}

const STATUS_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: "#f0fdf4", text: "#16a34a", label: "Active"    },
  scheduled: { bg: "#eff6ff", text: "#1d4ed8", label: "Scheduled" },
  expired:   { bg: "#f9fafb", text: "#6b7280", label: "Expired"   },
  inactive:  { bg: "#fffbeb", text: "#d97706", label: "Paused"    },
};

const EMPTY_FORM = {
  offerType: "ORDER_DISCOUNT", title: "", bannerText: "", description: "",
  discountType: "PERCENT", discountValue: "", maxDiscount: "", minOrderValue: "",
  applicableItemIds: [] as string[], buyItemId: "", buyQty: "1",
  getItemId: "", getQty: "1",
  comboItems: [{ itemId: "", qty: "1" }] as { itemId: string; qty: string }[],
  comboPrice: "", validFrom: "", validUntil: "",
  maxUsesTotal: "", maxUsesPerUser: "0",
  applicableDays: [] as string[], startTime: "", endTime: "",
  isFirstOrderOnly: false, isAutoApply: true,
};

export function OffersScreen({ onBack }: Props) {
  const [offers, setOffers]       = useState<Offer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [showForm, setShowForm]   = useState(false);
  const [editOffer, setEditOffer] = useState<Offer | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchOffers = useCallback(() => {
    api.get("/vendor/offers").then(r => setOffers(r.data.offers || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOffers();
    api.get("/vendor/menu/items").then(r => setMenuItems(r.data.items || [])).catch(() => {});
  }, [fetchOffers]);

  const filtered = offers.filter(o => statusTab === "all" || getStatus(o) === statusTab);

  const counts = {
    all:       offers.length,
    active:    offers.filter(o => getStatus(o) === "active").length,
    scheduled: offers.filter(o => getStatus(o) === "scheduled").length,
    inactive:  offers.filter(o => getStatus(o) === "inactive").length,
    expired:   offers.filter(o => getStatus(o) === "expired").length,
  };

  const handleToggle = async (offer: Offer) => {
    setTogglingId(offer.id);
    try {
      await api.patch(`/vendor/offers/${offer.id}`, { isActive: !offer.isActive });
      fetchOffers();
    } catch {
      Alert.alert("Error", "Failed to update offer");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (offer: Offer) => {
    Alert.alert("Delete Offer", `Delete "${offer.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await api.delete(`/vendor/offers/${offer.id}`);
          fetchOffers();
        } catch { Alert.alert("Error", "Failed to delete offer"); }
      }},
    ]);
  };

  const renderOffer = ({ item: o }: { item: Offer }) => {
    const cfg   = TYPE_CFG[o.offerType] || TYPE_CFG.ORDER_DISCOUNT;
    const stat  = getStatus(o);
    const sCfg  = STATUS_COLOR[stat] || STATUS_COLOR.inactive;
    const isToggling = togglingId === o.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeIcon, { backgroundColor: cfg.color + "20" }]}>
            <Text style={styles.typeEmoji}>{cfg.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{o.title}</Text>
            <Text style={styles.cardType}>{cfg.label}</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: sCfg.bg }]}>
            <Text style={[styles.statText, { color: sCfg.text }]}>{sCfg.label}</Text>
          </View>
        </View>

        <View style={styles.discountBox}>
          {o.bannerText ? <Text style={styles.bannerText}>{o.bannerText}</Text> : null}
          <Text style={styles.discountText}>{discountSummary(o)}</Text>
        </View>

        <Text style={styles.dateRange}>📅 {fmtDate(o.validFrom)} → {fmtDate(o.validUntil)}</Text>
        {(o.maxUsesTotal ?? 0) > 0 && (
          <View style={styles.usageRow}>
            <Text style={styles.usageText}>👥 {o.usedCount ?? 0} / {o.maxUsesTotal} uses</Text>
            <View style={styles.usageBarBg}>
              <View style={[styles.usageBarFill, { flex: Math.min(o.usedCount ?? 0, o.maxUsesTotal!) / o.maxUsesTotal! }]} />
            </View>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, o.isActive ? styles.pauseBtn : styles.activateBtn]}
            onPress={() => handleToggle(o)} disabled={isToggling}
          >
            <Text style={o.isActive ? styles.pauseBtnText : styles.activateBtnText}>
              {isToggling ? "…" : (o.isActive ? "Pause" : "Activate")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.editBtn]}
            onPress={() => { setEditOffer(o); setShowForm(true); }}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(o)}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Offers</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => { setEditOffer(null); setShowForm(true); }}>
          <Text style={styles.createBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Status tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {STATUS_TABS.map(tab => {
          const cnt = counts[tab];
          if (cnt === 0 && tab !== "all") return null;
          return (
            <TouchableOpacity key={tab} style={[styles.tab, statusTab === tab && styles.tabActive]} onPress={() => setStatusTab(tab)}>
              <Text style={[styles.tabText, statusTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)} {cnt > 0 ? `(${cnt})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={o => o.id}
          renderItem={renderOffer}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🏷️</Text>
              <Text style={styles.emptyTitle}>{offers.length === 0 ? "No offers yet" : `No ${statusTab} offers`}</Text>
              {offers.length === 0 && (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => { setEditOffer(null); setShowForm(true); }}>
                  <Text style={styles.emptyBtnText}>Create First Offer</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Offer form modal */}
      <OfferFormModal
        visible={showForm}
        editOffer={editOffer}
        menuItems={menuItems}
        onClose={() => { setShowForm(false); setEditOffer(null); }}
        onSuccess={() => { setShowForm(false); setEditOffer(null); fetchOffers(); }}
      />
    </View>
  );
}

/* ── Offer Form Modal ─────────────────────────────────────────────────────── */

function OfferFormModal({ visible, editOffer, menuItems, onClose, onSuccess }:
  { visible: boolean; editOffer: Offer | null; menuItems: MenuItem[]; onClose: () => void; onSuccess: () => void }) {

  const isEdit = !!editOffer;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [itemPicker, setItemPicker] = useState<{ visible: boolean; field: string; multi: boolean }>({ visible: false, field: "", multi: false });

  useEffect(() => {
    if (!visible) return;
    if (editOffer) {
      setForm({
        offerType:         editOffer.offerType || "ORDER_DISCOUNT",
        title:             editOffer.title || "",
        bannerText:        editOffer.bannerText || "",
        description:       editOffer.description || "",
        discountType:      editOffer.discountType || "PERCENT",
        discountValue:     editOffer.discountValue?.toString() || "",
        maxDiscount:       editOffer.maxDiscount?.toString() || "",
        minOrderValue:     editOffer.minOrderValue?.toString() || "",
        applicableItemIds: parseJSON(editOffer.applicableItemIds),
        buyItemId:         editOffer.buyItemId || "",
        buyQty:            editOffer.buyQty?.toString() || "1",
        getItemId:         editOffer.getItemId || "",
        getQty:            editOffer.getQty?.toString() || "1",
        comboItems:        parseJSON(editOffer.comboItems).length
          ? parseJSON(editOffer.comboItems).map((r: any) => ({ itemId: r.itemId || "", qty: String(r.qty || 1) }))
          : [{ itemId: "", qty: "1" }],
        comboPrice:        editOffer.comboPrice?.toString() || "",
        validFrom:         editOffer.validFrom ? editOffer.validFrom.slice(0, 10) : "",
        validUntil:        editOffer.validUntil ? editOffer.validUntil.slice(0, 10) : "",
        maxUsesTotal:      editOffer.maxUsesTotal?.toString() || "",
        maxUsesPerUser:    editOffer.maxUsesPerUser?.toString() || "0",
        applicableDays:    parseJSON(editOffer.applicableDays),
        startTime:         editOffer.startTime || "",
        endTime:           editOffer.endTime || "",
        isFirstOrderOnly:  !!editOffer.isFirstOrderOnly,
        isAutoApply:       editOffer.isAutoApply !== false,
      });
    } else {
      setForm({ ...EMPTY_FORM, comboItems: [{ itemId: "", qty: "1" }], applicableItemIds: [], applicableDays: [] });
    }
  }, [visible, editOffer]);

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));
  const tog = (key: string) => () => setForm(f => ({ ...f, [key]: !(f as any)[key] }));

  const toggleDay = (day: string) => setForm(f => ({
    ...f, applicableDays: f.applicableDays.includes(day)
      ? f.applicableDays.filter(d => d !== day)
      : [...f.applicableDays, day],
  }));

  const getItemName = (id: string) => menuItems.find(m => m.id === id)?.name || id.slice(-6);

  const openItemPicker = (field: string, multi: boolean) => setItemPicker({ visible: true, field, multi });
  const closeItemPicker = () => setItemPicker(p => ({ ...p, visible: false }));

  const selectItem = (id: string) => {
    if (itemPicker.multi) {
      setForm(f => {
        const list: string[] = (f as any)[itemPicker.field] || [];
        return { ...f, [itemPicker.field]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] };
      });
    } else {
      setForm(f => ({ ...f, [itemPicker.field]: id }));
      closeItemPicker();
    }
  };

  const showDiscount   = ["ORDER_DISCOUNT", "ITEM_DISCOUNT", "HAPPY_HOURS"].includes(form.offerType);
  const showItems      = form.offerType === "ITEM_DISCOUNT";
  const showBogo       = form.offerType === "BOGO";
  const showFreeItem   = form.offerType === "FREE_ITEM";
  const showCombo      = form.offerType === "COMBO";
  const showTimeSlots  = form.offerType === "HAPPY_HOURS";

  const handleSubmit = async () => {
    if (!form.title.trim())  { Alert.alert("Required", "Offer title is required");  return; }
    if (!form.validFrom)     { Alert.alert("Required", "Start date is required");   return; }
    if (!form.validUntil)    { Alert.alert("Required", "End date is required");     return; }
    if (!isValidIsoDate(form.validFrom))
      { Alert.alert("Invalid date", "Start date must be a valid date in YYYY-MM-DD format"); return; }
    if (!isValidIsoDate(form.validUntil))
      { Alert.alert("Invalid date", "End date must be a valid date in YYYY-MM-DD format"); return; }
    if (!isIsoDateBefore(form.validFrom, form.validUntil))
      { Alert.alert("Invalid", "End date must be after start date"); return; }
    if (showDiscount && (!form.discountValue || parseFloat(form.discountValue) <= 0))
      { Alert.alert("Required", "Enter a valid discount value"); return; }
    if (showBogo && (!form.buyItemId || !form.getItemId))
      { Alert.alert("Required", "Select both buy and get items"); return; }
    if (showFreeItem && !form.getItemId)
      { Alert.alert("Required", "Select the free item"); return; }
    if (showCombo) {
      if (form.comboItems.some(r => !r.itemId)) { Alert.alert("Required", "Select all combo items"); return; }
      if (!form.comboPrice || parseFloat(form.comboPrice) <= 0) { Alert.alert("Required", "Enter combo price"); return; }
    }

    setSaving(true);
    try {
      const payload = {
        offerType:         form.offerType,
        title:             form.title.trim(),
        bannerText:        form.bannerText.trim() || undefined,
        description:       form.description.trim() || "",
        discountType:      showDiscount ? form.discountType : undefined,
        discountValue:     parseFloat(form.discountValue) || 0,
        maxDiscount:       form.maxDiscount ? parseFloat(form.maxDiscount) : undefined,
        minOrderValue:     parseFloat(form.minOrderValue) || 0,
        applicableItemIds: form.applicableItemIds,
        buyItemId:         form.buyItemId || undefined,
        buyQty:            parseInt(form.buyQty) || 1,
        getItemId:         form.getItemId || undefined,
        getQty:            parseInt(form.getQty) || 1,
        comboItems:        form.comboItems.filter(r => r.itemId).map(r => ({ itemId: r.itemId, qty: parseInt(r.qty) || 1 })),
        comboPrice:        form.comboPrice ? parseFloat(form.comboPrice) : undefined,
        validFrom:         form.validFrom,
        validUntil:        form.validUntil,
        maxUsesTotal:      form.maxUsesTotal ? parseInt(form.maxUsesTotal) : undefined,
        maxUsesPerUser:    parseInt(form.maxUsesPerUser) || 0,
        applicableDays:    form.applicableDays,
        startTime:         form.startTime || undefined,
        endTime:           form.endTime || undefined,
        isFirstOrderOnly:  form.isFirstOrderOnly,
        isAutoApply:       form.isAutoApply,
      };
      if (isEdit && editOffer) {
        await api.patch(`/vendor/offers/${editOffer.id}`, payload);
      } else {
        await api.post("/vendor/offers", payload);
      }
      onSuccess();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to save offer");
    } finally {
      setSaving(false);
    }
  };

  const selectedItemIds: string[] = (form as any)[itemPicker.field] || [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={fStyles2.container}>
        {/* Form header */}
        <View style={fStyles2.header}>
          <View>
            <Text style={fStyles2.title}>{isEdit ? "Edit Offer" : "Create Offer"}</Text>
            <Text style={fStyles2.subtitle}>{isEdit ? "Update offer details below" : "Set up a new promotion"}</Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={saving} style={fStyles2.closeBtn}>
            <Text style={fStyles2.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={fStyles2.body} showsVerticalScrollIndicator={false}>

            {/* Offer type grid */}
            <FLabel>Offer Type</FLabel>
            <View style={fStyles.typeGrid}>
              {Object.entries(TYPE_CFG).map(([key, cfg]) => (
                <TouchableOpacity key={key} style={[fStyles.typeCell, form.offerType === key && fStyles.typeCellActive]}
                  onPress={() => setForm(f => ({ ...f, offerType: key }))}>
                  <Text style={fStyles.typeCellEmoji}>{cfg.emoji}</Text>
                  <Text style={[fStyles.typeCellLabel, form.offerType === key && fStyles.typeCellLabelActive]}>{cfg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={fStyles.typeDesc}>{TYPE_CFG[form.offerType]?.desc}</Text>

            <Divider />

            {/* Basic info */}
            <FLabel>Offer Title *</FLabel>
            <TextInput style={fStyles.input} value={form.title} onChangeText={set("title")} placeholder="e.g. Weekend Special" placeholderTextColor="#d1d5db" />

            <View style={fStyles.row2}>
              <View style={{ flex: 1 }}>
                <FLabel>Banner Text</FLabel>
                <TextInput style={fStyles.input} value={form.bannerText} onChangeText={set("bannerText")} placeholder="e.g. 20% OFF" placeholderTextColor="#d1d5db" maxLength={20} />
              </View>
              <View style={{ flex: 1 }}>
                <FLabel>Min Order (₹)</FLabel>
                <TextInput style={fStyles.input} value={form.minOrderValue} onChangeText={set("minOrderValue")} placeholder="0" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
              </View>
            </View>

            <FLabel>Description (Optional)</FLabel>
            <TextInput style={[fStyles.input, fStyles.textarea]} value={form.description} onChangeText={set("description")} placeholder="Brief description for customers…" placeholderTextColor="#d1d5db" multiline numberOfLines={2} />

            {/* Discount section */}
            {showDiscount && (
              <>
                <Divider />
                <FLabel>Discount Type</FLabel>
                <View style={fStyles.segRow}>
                  {[["PERCENT", "% Percentage"], ["FLAT", "₹ Flat Amount"]].map(([val, lbl]) => (
                    <TouchableOpacity key={val} style={[fStyles.seg, form.discountType === val && fStyles.segActive]}
                      onPress={() => setForm(f => ({ ...f, discountType: val }))}>
                      <Text style={[fStyles.segText, form.discountType === val && fStyles.segTextActive]}>{lbl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={fStyles.row2}>
                  <View style={{ flex: 1 }}>
                    <FLabel>{form.discountType === "PERCENT" ? "Percentage (%)" : "Amount (₹)"} *</FLabel>
                    <TextInput style={fStyles.input} value={form.discountValue} onChangeText={set("discountValue")} placeholder={form.discountType === "PERCENT" ? "20" : "50"} placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
                  </View>
                  {form.discountType === "PERCENT" && (
                    <View style={{ flex: 1 }}>
                      <FLabel>Max Discount (₹)</FLabel>
                      <TextInput style={fStyles.input} value={form.maxDiscount} onChangeText={set("maxDiscount")} placeholder="Optional cap" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ITEM_DISCOUNT: item multi-select */}
            {showItems && (
              <>
                <Divider />
                <FLabel>Applicable Items (leave empty = all items)</FLabel>
                <TouchableOpacity style={fStyles.itemPickerBtn} onPress={() => openItemPicker("applicableItemIds", true)}>
                  <Text style={fStyles.itemPickerText}>
                    {form.applicableItemIds.length > 0
                      ? form.applicableItemIds.map(id => getItemName(id)).join(", ")
                      : "Tap to select items…"}
                  </Text>
                  <Text style={fStyles.itemPickerChev}>›</Text>
                </TouchableOpacity>
              </>
            )}

            {/* BOGO */}
            {showBogo && (
              <>
                <Divider />
                <FLabel>Buy Item *</FLabel>
                <View style={fStyles.row2}>
                  <View style={{ flex: 2 }}>
                    <TouchableOpacity style={fStyles.itemPickerBtn} onPress={() => openItemPicker("buyItemId", false)}>
                      <Text style={fStyles.itemPickerText}>{form.buyItemId ? getItemName(form.buyItemId) : "Select item…"}</Text>
                      <Text style={fStyles.itemPickerChev}>›</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <FLabel>Qty</FLabel>
                    <TextInput style={fStyles.input} value={form.buyQty} onChangeText={set("buyQty")} keyboardType="number-pad" placeholder="1" placeholderTextColor="#d1d5db" />
                  </View>
                </View>
                <FLabel>Customer Gets (Free) *</FLabel>
                <View style={fStyles.row2}>
                  <View style={{ flex: 2 }}>
                    <TouchableOpacity style={fStyles.itemPickerBtn} onPress={() => openItemPicker("getItemId", false)}>
                      <Text style={fStyles.itemPickerText}>{form.getItemId ? getItemName(form.getItemId) : "Select free item…"}</Text>
                      <Text style={fStyles.itemPickerChev}>›</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <FLabel>Qty</FLabel>
                    <TextInput style={fStyles.input} value={form.getQty} onChangeText={set("getQty")} keyboardType="number-pad" placeholder="1" placeholderTextColor="#d1d5db" />
                  </View>
                </View>
              </>
            )}

            {/* FREE_ITEM */}
            {showFreeItem && (
              <>
                <Divider />
                <FLabel>Free Item *</FLabel>
                <View style={fStyles.row2}>
                  <View style={{ flex: 2 }}>
                    <TouchableOpacity style={fStyles.itemPickerBtn} onPress={() => openItemPicker("getItemId", false)}>
                      <Text style={fStyles.itemPickerText}>{form.getItemId ? getItemName(form.getItemId) : "Select free item…"}</Text>
                      <Text style={fStyles.itemPickerChev}>›</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <FLabel>Quantity</FLabel>
                    <TextInput style={fStyles.input} value={form.getQty} onChangeText={set("getQty")} keyboardType="number-pad" placeholder="1" placeholderTextColor="#d1d5db" />
                  </View>
                </View>
              </>
            )}

            {/* COMBO */}
            {showCombo && (
              <>
                <Divider />
                <FLabel>Combo Items *</FLabel>
                {form.comboItems.map((row, idx) => (
                  <View key={idx} style={[fStyles.row2, { marginBottom: 8 }]}>
                    <View style={{ flex: 2 }}>
                      <TouchableOpacity style={fStyles.itemPickerBtn} onPress={() => {
                        setItemPicker({ visible: true, field: `__combo_${idx}`, multi: false });
                      }}>
                        <Text style={fStyles.itemPickerText}>{row.itemId ? getItemName(row.itemId) : "Select item…"}</Text>
                        <Text style={fStyles.itemPickerChev}>›</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextInput style={fStyles.input} value={row.qty}
                        onChangeText={v => setForm(f => ({ ...f, comboItems: f.comboItems.map((r, i) => i === idx ? { ...r, qty: v } : r) }))}
                        keyboardType="number-pad" placeholder="Qty" placeholderTextColor="#d1d5db" />
                    </View>
                    {form.comboItems.length > 1 && (
                      <TouchableOpacity onPress={() => setForm(f => ({ ...f, comboItems: f.comboItems.filter((_, i) => i !== idx) }))}>
                        <Text style={{ fontSize: 20, color: "#ef4444", paddingHorizontal: 6 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={() => setForm(f => ({ ...f, comboItems: [...f.comboItems, { itemId: "", qty: "1" }] }))}>
                  <Text style={fStyles.addRowText}>+ Add item to combo</Text>
                </TouchableOpacity>
                <FLabel>Bundle Price (₹) *</FLabel>
                <TextInput style={fStyles.input} value={form.comboPrice} onChangeText={set("comboPrice")} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#d1d5db" />
              </>
            )}

            {/* HAPPY_HOURS: time + days */}
            {showTimeSlots && (
              <>
                <Divider />
                <View style={fStyles.row2}>
                  <View style={{ flex: 1 }}>
                    <FLabel>Start Time *</FLabel>
                    <TextInput style={fStyles.input} value={form.startTime} onChangeText={set("startTime")} placeholder="HH:MM" placeholderTextColor="#d1d5db" keyboardType="numbers-and-punctuation" maxLength={5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FLabel>End Time *</FLabel>
                    <TextInput style={fStyles.input} value={form.endTime} onChangeText={set("endTime")} placeholder="HH:MM" placeholderTextColor="#d1d5db" keyboardType="numbers-and-punctuation" maxLength={5} />
                  </View>
                </View>
                <FLabel>Active Days (empty = all days)</FLabel>
                <View style={fStyles.daysRow}>
                  {DAYS_ABBR.map(day => (
                    <TouchableOpacity key={day} style={[fStyles.dayPill, form.applicableDays.includes(day) && fStyles.dayPillActive]}
                      onPress={() => toggleDay(day)}>
                      <Text style={[fStyles.dayPillText, form.applicableDays.includes(day) && fStyles.dayPillTextActive]}>
                        {day.slice(0, 2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Divider />

            {/* Validity */}
            <FLabel>Validity Period</FLabel>
            <View style={fStyles.row2}>
              <View style={{ flex: 1 }}>
                <FLabel>Start Date *</FLabel>
                <TextInput style={fStyles.input} value={form.validFrom} onChangeText={set("validFrom")} placeholder="YYYY-MM-DD" placeholderTextColor="#d1d5db" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
              <View style={{ flex: 1 }}>
                <FLabel>End Date *</FLabel>
                <TextInput style={fStyles.input} value={form.validUntil} onChangeText={set("validUntil")} placeholder="YYYY-MM-DD" placeholderTextColor="#d1d5db" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
            </View>

            <Divider />

            {/* Advanced */}
            <FLabel>Limits & Options</FLabel>
            <View style={fStyles.row2}>
              <View style={{ flex: 1 }}>
                <FLabel>Total Uses (∞ = unlimited)</FLabel>
                <TextInput style={fStyles.input} value={form.maxUsesTotal} onChangeText={set("maxUsesTotal")} placeholder="∞" placeholderTextColor="#d1d5db" keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FLabel>Per Customer (0 = unlimited)</FLabel>
                <TextInput style={fStyles.input} value={form.maxUsesPerUser} onChangeText={set("maxUsesPerUser")} placeholder="0" placeholderTextColor="#d1d5db" keyboardType="number-pad" />
              </View>
            </View>
            <View style={fStyles.toggleRow}>
              <Text style={fStyles.toggleLabel}>First Order Only</Text>
              <Switch value={form.isFirstOrderOnly} onValueChange={tog("isFirstOrderOnly")} trackColor={{ true: "#059669", false: "#e5e7eb" }} thumbColor="#fff" />
            </View>
            <View style={fStyles.toggleRow}>
              <Text style={fStyles.toggleLabel}>Auto-Apply When Eligible</Text>
              <Switch value={form.isAutoApply} onValueChange={tog("isAutoApply")} trackColor={{ true: "#059669", false: "#e5e7eb" }} thumbColor="#fff" />
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={fStyles2.footer}>
          <TouchableOpacity style={fStyles2.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={fStyles2.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[fStyles2.submitBtn, saving && fStyles2.submitBtnDisabled]} onPress={handleSubmit} disabled={saving}>
            <Text style={fStyles2.submitText}>{saving ? "Saving…" : (isEdit ? "Update Offer" : "Create Offer")}</Text>
          </TouchableOpacity>
        </View>

        {/* Item picker modal */}
        <Modal visible={itemPicker.visible} transparent animationType="slide" onRequestClose={closeItemPicker}>
          <View style={ipStyles.overlay}>
            <View style={ipStyles.sheet}>
              <View style={ipStyles.handle} />
              <Text style={ipStyles.title}>{itemPicker.multi ? "Select Items" : "Select Item"}</Text>
              <FlatList
                data={menuItems}
                keyExtractor={m => m.id}
                renderItem={({ item: m }) => {
                  const field = itemPicker.field.startsWith("__combo_")
                    ? null : itemPicker.field;
                  const comboIdx = itemPicker.field.startsWith("__combo_")
                    ? parseInt(itemPicker.field.replace("__combo_", "")) : -1;

                  let isSelected = false;
                  if (field && itemPicker.multi) {
                    isSelected = ((form as any)[field] || []).includes(m.id);
                  } else if (field && !itemPicker.multi) {
                    isSelected = (form as any)[field] === m.id;
                  } else if (comboIdx >= 0) {
                    isSelected = form.comboItems[comboIdx]?.itemId === m.id;
                  }

                  return (
                    <TouchableOpacity style={[ipStyles.option, isSelected && ipStyles.optionActive]}
                      onPress={() => {
                        if (comboIdx >= 0) {
                          setForm(f => ({ ...f, comboItems: f.comboItems.map((r, i) => i === comboIdx ? { ...r, itemId: m.id } : r) }));
                          closeItemPicker();
                        } else {
                          selectItem(m.id);
                        }
                      }}>
                      <Text style={[ipStyles.optionName, isSelected && ipStyles.optionNameActive]}>{m.name}</Text>
                      <View style={ipStyles.optionRight}>
                        <Text style={ipStyles.optionPrice}>₹{m.basePrice}</Text>
                        {isSelected && <Text style={ipStyles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
              {itemPicker.multi && (
                <TouchableOpacity style={ipStyles.doneBtn} onPress={closeItemPicker}>
                  <Text style={ipStyles.doneBtnText}>Done ({selectedItemIds.length} selected)</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function FLabel({ children }: { children: React.ReactNode }) {
  return <Text style={fStyles.label}>{children}</Text>;
}
function Divider() { return <View style={{ height: 1, backgroundColor: "#f3f4f6", marginVertical: 16 }} />; }

const fStyles = StyleSheet.create({
  label:    { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input:    { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#111827" },
  textarea: { minHeight: 64, textAlignVertical: "top" },
  row2:     { flexDirection: "row", gap: 10 },
  segRow:   { flexDirection: "row", gap: 10, marginBottom: 8 },
  seg:      { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  segActive:{ borderColor: "#059669", backgroundColor: "#f0fdf4" },
  segText:  { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  segTextActive: { color: "#059669" },
  itemPickerBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4 },
  itemPickerText: { flex: 1, fontSize: 14, color: "#374151" },
  itemPickerChev: { fontSize: 20, color: "#9ca3af" },
  addRowText: { fontSize: 13, color: "#059669", fontWeight: "600", marginBottom: 8 },
  daysRow:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  dayPill:  { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  dayPillActive: { borderColor: "#059669", backgroundColor: "#059669" },
  dayPillText: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
  dayPillTextActive: { color: "#fff" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  toggleLabel: { fontSize: 14, color: "#374151", flex: 1 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCell: { width: "30%", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingVertical: 10, alignItems: "center", gap: 4 },
  typeCellActive: { borderColor: "#059669", backgroundColor: "#f0fdf4" },
  typeCellEmoji: { fontSize: 22 },
  typeCellLabel: { fontSize: 11, fontWeight: "600", color: "#6b7280", textAlign: "center" },
  typeCellLabelActive: { color: "#059669" },
  typeDesc: { fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 4, marginBottom: 4 },
});

const ipStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet:    { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%", paddingTop: 12, paddingBottom: 20 },
  handle:   { width: 40, height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title:    { fontSize: 16, fontWeight: "700", color: "#111827", paddingHorizontal: 20, marginBottom: 10 },
  option:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  optionActive: { backgroundColor: "#f0fdf4" },
  optionName: { flex: 1, fontSize: 14, color: "#374151" },
  optionNameActive: { color: "#059669", fontWeight: "600" },
  optionRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionPrice: { fontSize: 13, color: "#9ca3af" },
  checkmark: { fontSize: 16, color: "#059669" },
  doneBtn:  { backgroundColor: "#059669", borderRadius: 14, marginHorizontal: 20, marginTop: 12, paddingVertical: 14, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#f9fafb" },
  center:        { flex: 1, alignItems: "center", justifyContent: "center" },
  header:        { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14 },
  backBtn:       { marginRight: 8, padding: 4 },
  backIcon:      { fontSize: 30, color: "#059669", lineHeight: 34 },
  headerTitle:   { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  createBtn:     { backgroundColor: "#059669", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  tabsScroll:    { maxHeight: 48, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  tabsContent:   { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  tab:           { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: "#e5e7eb" },
  tabActive:     { backgroundColor: "#059669", borderColor: "#059669" },
  tabText:       { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  tabTextActive: { color: "#fff" },

  list:          { padding: 14, gap: 12 },
  card:          { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f3f4f6" },
  cardHeader:    { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  typeIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  typeEmoji:     { fontSize: 20 },
  cardTitle:     { fontSize: 14, fontWeight: "700", color: "#111827" },
  cardType:      { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  statBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statText:      { fontSize: 11, fontWeight: "600" },
  discountBox:   { backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, marginBottom: 10 },
  bannerText:    { fontSize: 15, fontWeight: "900", color: "#f97316", marginBottom: 2 },
  discountText:  { fontSize: 12, color: "#6b7280" },
  dateRange:     { fontSize: 12, color: "#9ca3af", marginBottom: 6 },
  usageRow:      { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  usageText:     { fontSize: 11, color: "#9ca3af" },
  usageBarBg:    { flex: 1, flexDirection: "row", height: 4, backgroundColor: "#f3f4f6", borderRadius: 2, overflow: "hidden" },
  usageBarFill:  { height: 4, backgroundColor: "#f97316" },
  cardActions:   { flexDirection: "row", gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f9fafb" },
  actionBtn:     { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1 },
  pauseBtn:      { borderColor: "#fde68a", backgroundColor: "#fffbeb" },
  pauseBtnText:  { fontSize: 12, fontWeight: "600", color: "#d97706" },
  activateBtn:   { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  activateBtnText:{ fontSize: 12, fontWeight: "600", color: "#059669" },
  editBtn:       { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" },
  editBtnText:   { fontSize: 12, fontWeight: "600", color: "#374151" },
  deleteBtn:     { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  deleteBtnText: { fontSize: 12, fontWeight: "600", color: "#ef4444" },

  emptyState:    { flex: 1, alignItems: "center", paddingTop: 60 },
  emptyEmoji:    { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 16 },
  emptyBtn:      { backgroundColor: "#059669", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  emptyBtnText:  { color: "#fff", fontWeight: "700", fontSize: 15 },
});

const fStyles2 = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header:    { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 20, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  title:     { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle:  { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  closeBtn:  { padding: 4 },
  closeIcon: { fontSize: 18, color: "#9ca3af" },
  body:      { padding: 20, paddingBottom: 20 },
  footer:    { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  cancelBtn: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelText:{ fontSize: 15, fontWeight: "600", color: "#6b7280" },
  submitBtn: { flex: 2, backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { opacity: 0.6 },
  submitText:{ color: "#fff", fontSize: 15, fontWeight: "700" },
});

Object.assign(fStyles, fStyles2);
