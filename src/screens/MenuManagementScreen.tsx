import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Switch, Alert, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import { pickImage } from "../lib/imagePicker";
import { api } from "../lib/api";

interface MenuItem {
  id: string; name: string; basePrice: number; categoryId: string; categoryName?: string;
  isAvailable: boolean; primaryTag: string; isVerified: boolean;
  healthyScore: number | null; description?: string; imageUrl?: string;
  hasOnion?: boolean; hasGarlic?: boolean; hasRootVegetables?: boolean;
  isStrictlyJain?: boolean; canCustomizeToJain?: boolean; jainNote?: string;
  isLowOil?: boolean; isHighProtein?: boolean; isSugarFree?: boolean; isLowCarb?: boolean;
  calories?: number | null; protein?: number | null; carbs?: number | null;
  fat?: number | null; fiber?: number | null; sugar?: number | null;
}
// A vendor's own category row — masterCategoryId is set when it was adopted
// from the platform-wide Master Category list (see MasterCategory below).
interface Category { id: string; name: string; masterCategoryId?: string | null }
// Admin-managed, platform-wide category shown to every vendor by default.
interface MasterCategory { id: string; name: string }
interface FeeSetting { type: "value" | "percentage"; amount: number }

interface CategoryGroup extends Category { menuItems: MenuItem[] }

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  VEG:     { bg: "#f0fdf4", text: "#16a34a" },
  NON_VEG: { bg: "#fef2f2", text: "#dc2626" },
  JAIN:    { bg: "#fffbeb", text: "#d97706" },
  HEALTHY: { bg: "#eff6ff", text: "#2563eb" },
  EGG:     { bg: "#fff7ed", text: "#ea580c" },
  VEGAN:   { bg: "#f0fdf4", text: "#15803d" },
};
const PRIMARY_TAGS = ["VEG", "NON_VEG", "EGG", "VEGAN", "JAIN", "HEALTHY"];
const MASTER_PREFIX = "master:";

const EMPTY_FORM = {
  name: "", categoryId: "", newCategoryName: "", useNewCategory: false,
  basePrice: "", primaryTag: "VEG", description: "", imageUrl: "",
  hasOnion: true, hasGarlic: true, hasRootVegetables: true,
  isStrictlyJain: false, canCustomizeToJain: false, jainNote: "",
  isLowOil: false, isHighProtein: false, isSugarFree: false, isLowCarb: false,
  calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "",
};

type FilterTag = "ALL" | string;

export function MenuManagementScreen() {
  const [items, setItems]           = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [masterCategories, setMasterCategories] = useState<MasterCategory[]>([]);
  const [dashitoPriceSetting, setDashitoPriceSetting] = useState<FeeSetting>({ type: "value", amount: 5 });
  const [packagingFeeSetting, setPackagingFeeSetting] = useState<FeeSetting>({ type: "value", amount: 0 });
  const [loading, setLoading]       = useState(true);
  const [isError, setIsError]       = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editItem, setEditItem]     = useState<MenuItem | null>(null);
  const [search, setSearch]         = useState("");
  const [filterTag, setFilterTag]   = useState<FilterTag>("ALL");

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setIsError(false);
    try {
      const [menuRes, masterRes] = await Promise.all([
        api.get("/vendor/menu/items"),
        api.get("/master-menu-categories").catch(() => ({ data: { categories: [] } })),
      ]);
      setItems(menuRes.data.items || []);
      setCategories(menuRes.data.categories || []);
      setDashitoPriceSetting(menuRes.data.dashitoPriceSetting || { type: "value", amount: 5 });
      setPackagingFeeSetting(menuRes.data.packagingFeeSetting || { type: "value", amount: 0 });
      setMasterCategories(masterRes.data.categories || []);
    } catch {
      setIsError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const totalItems = items.length;
  const availableItems = items.filter(i => i.isAvailable).length;

  const tagCounts = useMemo(() => items.reduce<Record<string, number>>((acc, item) => {
    if (item.primaryTag) acc[item.primaryTag] = (acc[item.primaryTag] || 0) + 1;
    return acc;
  }, {}), [items]);

  // Data-driven, like web — only tags actually present on items show up as filter chips
  const filterTags = useMemo<FilterTag[]>(() => ["ALL", ...Object.keys(tagCounts)], [tagCounts]);

  // Group the flat items list by category for display — the API returns
  // items and categories as separate flat arrays (GET /vendor/menu/items),
  // not nested, so the grouping happens client-side.
  const filteredCategoryGroups = useMemo<CategoryGroup[]>(() => {
    const filteredItems = items.filter(item => {
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchTag = filterTag === "ALL" || item.primaryTag === filterTag;
      return matchSearch && matchTag;
    });
    return categories
      .map(cat => ({ ...cat, menuItems: filteredItems.filter(i => i.categoryId === cat.id) }))
      .filter(cat => cat.menuItems.length > 0);
  }, [categories, items, search, filterTag]);

  const toggleAvailability = async (itemId: string, currentlyAvailable: boolean) => {
    try {
      await api.patch(`/vendor/menu/items/${itemId}/availability`);
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, isAvailable: !currentlyAvailable } : item
      ));
    } catch {
      Alert.alert("Error", "Could not update availability");
    }
  };

  const renderItem = ({ item }: { item: MenuItem }) => {
    const tagColor = TAG_COLORS[item.primaryTag] || TAG_COLORS.VEG;
    return (
      <TouchableOpacity
        style={[styles.itemRow, !item.isAvailable && styles.itemRowUnavailable]}
        onPress={() => { setEditItem(item); setShowForm(true); }}
        activeOpacity={0.75}
      >
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text style={[styles.itemName, !item.isAvailable && styles.itemNameGray]}>{item.name}</Text>
            {item.isVerified && (
              <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓</Text></View>
            )}
          </View>
          <View style={styles.itemMeta}>
            <Text style={styles.itemPrice}>₹{item.basePrice}</Text>
            <View style={[styles.tagBadge, { backgroundColor: tagColor.bg }]}>
              <Text style={[styles.tagText, { color: tagColor.text }]}>{item.primaryTag}</Text>
            </View>
            {item.healthyScore !== null && item.healthyScore !== undefined && (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{item.healthyScore}/100</Text>
              </View>
            )}
          </View>
        </View>
        <Switch
          value={item.isAvailable}
          onValueChange={(v) => { toggleAvailability(item.id, item.isAvailable); }}
          trackColor={{ true: "#22c55e", false: "#e5e7eb" }}
          thumbColor="#fff"
        />
      </TouchableOpacity>
    );
  };

  const renderCategory = ({ item: cat }: { item: CategoryGroup }) => (
    <View style={styles.category}>
      <Text style={styles.categoryTitle}>{cat.name}</Text>
      <FlatList data={cat.menuItems} keyExtractor={i => i.id} renderItem={renderItem} scrollEnabled={false} />
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Menu</Text>
          {totalItems > 0 && (
            <Text style={styles.headerSub}>{availableItems} of {totalItems} items available</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={styles.bulkBtn} onPress={() => setShowBulkUpload(true)}>
            <Text style={styles.bulkBtnText}>Bulk Upload</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => { setEditItem(null); setShowForm(true); }}>
            <Text style={styles.addBtnText}>+ Add Item</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search menu items…"
          placeholderTextColor="#d1d5db"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")} style={styles.searchClear}>
            <Text style={styles.searchClearText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tag filter chips */}
      {totalItems > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
          {filterTags.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.filterChip, filterTag === tag && styles.filterChipActive]}
              onPress={() => setFilterTag(tag)}
            >
              <Text style={[styles.filterChipText, filterTag === tag && styles.filterChipTextActive]}>
                {tag === "ALL" ? `All (${totalItems})` : `${tag.replace(/_/g, " ")} (${tagCounts[tag] || 0})`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Menu data unavailable</Text>
          <Text style={styles.emptySubtext}>Could not load your menu. Check your connection and try again.</Text>
          <TouchableOpacity onPress={fetchMenu} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No menu items yet.</Text>
          <Text style={styles.emptySubtext}>Tap "+ Add Item" to get started.</Text>
        </View>
      ) : filteredCategoryGroups.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No items match your search.</Text>
          <TouchableOpacity onPress={() => { setSearch(""); setFilterTag("ALL"); }}>
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredCategoryGroups}
          keyExtractor={c => c.id}
          renderItem={renderCategory}
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      <MenuItemFormModal
        visible={showForm}
        editItem={editItem}
        categories={categories}
        masterCategories={masterCategories}
        dashitoPriceSetting={dashitoPriceSetting}
        packagingFeeSetting={packagingFeeSetting}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        onSuccess={() => { setShowForm(false); setEditItem(null); fetchMenu(); }}
      />

      <BulkUploadModal
        visible={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={fetchMenu}
      />
    </View>
  );
}

/* ── Menu Item Form Modal ─────────────────────────────────────────────────── */

function MenuItemFormModal({ visible, editItem, categories, masterCategories, dashitoPriceSetting, packagingFeeSetting, onClose, onSuccess }: {
  visible: boolean; editItem: MenuItem | null; categories: Category[]; masterCategories: MasterCategory[];
  dashitoPriceSetting: FeeSetting; packagingFeeSetting: FeeSetting; onClose: () => void; onSuccess: () => void;
}) {

  const isEdit = !!editItem;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [showJain, setShowJain]   = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);

  // Master Categories are shown by default alongside the vendor's own —
  // categories already adopted from a master one (masterCategoryId set) are
  // excluded from "My Categories" so they don't appear twice.
  const privateCategories = useMemo(() => categories.filter(c => !c.masterCategoryId), [categories]);

  const packagingFeeDisplay = packagingFeeSetting.type === "percentage"
    ? `${packagingFeeSetting.amount}% per item`
    : `₹${packagingFeeSetting.amount} per item`;

  // Matches web's VendorMenu.jsx exactly: Dashito Price is read-only, derived
  // from Base Price + the admin-configured setting — never vendor-entered.
  const basePriceNum = parseFloat(form.basePrice);
  const dashitoPrice = form.basePrice && basePriceNum > 0
    ? (dashitoPriceSetting.type === "percentage"
        ? basePriceNum + (basePriceNum * dashitoPriceSetting.amount / 100)
        : basePriceNum + dashitoPriceSetting.amount)
    : null;
  const dashitoPriceDisplay = dashitoPrice !== null ? `₹${dashitoPrice.toFixed(0)}` : "—";
  const dashitoPriceHint = dashitoPriceSetting.type === "percentage"
    ? `Platform price (base + ${dashitoPriceSetting.amount}%)`
    : `Platform price (base + ₹${dashitoPriceSetting.amount})`;

  useEffect(() => {
    if (!visible) return;
    if (editItem) {
      // A category adopted from the master list shows as its "master:<id>" option
      // so it renders under the same "Master Categories" group it was picked from —
      // mirrors apps/admin/src/pages/vendor/VendorMenu.jsx's prefill exactly.
      const cat = categories.find(c => c.id === editItem.categoryId);
      const categoryId = cat?.masterCategoryId ? `${MASTER_PREFIX}${cat.masterCategoryId}` : (editItem.categoryId || "");
      setForm({
        name:              editItem.name || "",
        categoryId,
        newCategoryName:   "",
        useNewCategory:    false,
        basePrice:         editItem.basePrice?.toString() || "",
        primaryTag:        editItem.primaryTag || "VEG",
        description:       editItem.description || "",
        imageUrl:          editItem.imageUrl || "",
        hasOnion:          editItem.hasOnion !== false,
        hasGarlic:         editItem.hasGarlic !== false,
        hasRootVegetables: editItem.hasRootVegetables !== false,
        isStrictlyJain:    !!editItem.isStrictlyJain,
        canCustomizeToJain:!!editItem.canCustomizeToJain,
        jainNote:          editItem.jainNote || "",
        isLowOil:          !!editItem.isLowOil,
        isHighProtein:     !!editItem.isHighProtein,
        isSugarFree:       !!editItem.isSugarFree,
        isLowCarb:         !!editItem.isLowCarb,
        calories:          editItem.calories?.toString() || "",
        protein:           editItem.protein?.toString() || "",
        carbs:             editItem.carbs?.toString() || "",
        fat:               editItem.fat?.toString() || "",
        fiber:             editItem.fiber?.toString() || "",
        sugar:             editItem.sugar?.toString() || "",
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setShowJain(false); setShowHealth(false); setShowNutrition(false);
    setErrors({});
    setImageUploading(false);
  }, [visible, editItem]);

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));
  const tog = (key: string) => (val: boolean) => setForm(f => ({ ...f, [key]: val }));

  const handleImagePick = async () => {
    try {
      const file = await pickImage({ title: "Item Photo", aspect: [4, 3], maxWidth: 1280 });
      if (!file) return;
      setImageUploading(true);
      const fd = new FormData();
      fd.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
      const res = await api.post("/vendor/menu/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm(f => ({ ...f, imageUrl: res.data.imageUrl }));
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to upload image");
    } finally {
      setImageUploading(false);
    }
  };

  const removeImage = () => setForm(f => ({ ...f, imageUrl: "" }));

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())                                            errs.name       = "Item name is required";
    if (!form.basePrice || parseFloat(form.basePrice) <= 0)            errs.basePrice  = "Enter a valid base price";
    if (!form.useNewCategory && !form.categoryId)           errs.categoryId = "Select a category";
    if (form.useNewCategory && !form.newCategoryName.trim()) errs.newCategoryName = "Enter new category name";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name:              form.name.trim(),
        basePrice:         parseFloat(form.basePrice),
        primaryTag:        form.primaryTag,
        description:       form.description.trim(),
        imageUrl:          form.imageUrl.trim() || undefined,
        hasOnion:          form.hasOnion,
        hasGarlic:         form.hasGarlic,
        hasRootVegetables: form.hasRootVegetables,
        isStrictlyJain:    form.isStrictlyJain,
        canCustomizeToJain:form.canCustomizeToJain,
        jainNote:          form.jainNote.trim() || undefined,
        isLowOil:          form.isLowOil,
        isHighProtein:     form.isHighProtein,
        isSugarFree:       form.isSugarFree,
        isLowCarb:         form.isLowCarb,
        calories:          form.calories ? parseFloat(form.calories) : undefined,
        protein:           form.protein  ? parseFloat(form.protein)  : undefined,
        carbs:             form.carbs    ? parseFloat(form.carbs)    : undefined,
        fat:               form.fat      ? parseFloat(form.fat)      : undefined,
        fiber:             form.fiber    ? parseFloat(form.fiber)    : undefined,
        sugar:             form.sugar    ? parseFloat(form.sugar)    : undefined,
      };

      // Resolve the picked category to a real categoryId first — mirrors
      // apps/admin/src/pages/vendor/VendorMenu.jsx's exact resolution order.
      // Category can be changed in edit mode too, same as web.
      if (form.useNewCategory) {
        const catRes = await api.post("/vendor/menu/categories", { name: form.newCategoryName.trim() });
        payload.categoryId = catRes.data.id;
      } else if (form.categoryId.startsWith(MASTER_PREFIX)) {
        const masterCategoryId = form.categoryId.slice(MASTER_PREFIX.length);
        const catRes = await api.post("/vendor/menu/categories/from-master", { masterCategoryId });
        payload.categoryId = catRes.data.id;
      } else {
        payload.categoryId = form.categoryId;
      }

      if (!isEdit) {
        await api.post("/vendor/menu/items", payload);
      } else if (editItem) {
        // Edit is a PUT, not a PATCH — packages/api/src/routes/vendor.js only
        // registers PUT /menu/items/:id (PATCH is reserved for .../availability).
        await api.put(`/vendor/menu/items/${editItem.id}`, payload);
      }
      onSuccess();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={mStyles.container}>
        <View style={mStyles.header}>
          <View>
            <Text style={mStyles.title}>{isEdit ? "Edit Item" : "Add Menu Item"}</Text>
            <Text style={mStyles.subtitle}>{isEdit ? "Update item details" : "Add a new item to your menu"}</Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={saving} style={mStyles.closeBtn}>
            <Text style={mStyles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={mStyles.body} showsVerticalScrollIndicator={false}>

            {/* Basic Info */}
            <SLabel>Item Name *</SLabel>
            <TextInput style={[mStyles.input, errors.name && mStyles.inputError]} value={form.name} onChangeText={set("name")} placeholder="e.g. Paneer Butter Masala" placeholderTextColor="#d1d5db" />
            {errors.name && <Text style={mStyles.errorText}>{errors.name}</Text>}

            {/* Category — editable in both add and edit mode, same as web */}
            <>
                <SLabel>Category *</SLabel>
                <View style={mStyles.segRow}>
                  <TouchableOpacity style={[mStyles.seg, !form.useNewCategory && mStyles.segActive]}
                    onPress={() => setForm(f => ({ ...f, useNewCategory: false }))}>
                    <Text style={[mStyles.segText, !form.useNewCategory && mStyles.segTextActive]}>Existing</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[mStyles.seg, form.useNewCategory && mStyles.segActive]}
                    onPress={() => setForm(f => ({ ...f, useNewCategory: true }))}>
                    <Text style={[mStyles.segText, form.useNewCategory && mStyles.segTextActive]}>New Category</Text>
                  </TouchableOpacity>
                </View>
                {form.useNewCategory ? (
                  <>
                    <TextInput style={[mStyles.input, errors.newCategoryName && mStyles.inputError]} value={form.newCategoryName} onChangeText={set("newCategoryName")} placeholder="Category name" placeholderTextColor="#d1d5db" />
                    <Text style={mStyles.categoryHint}>Visible only to your restaurant — other vendors won't see it.</Text>
                  </>
                ) : (
                  <>
                    {masterCategories.length > 0 && (
                      <>
                        <Text style={mStyles.categoryGroupLabel}>Master Categories</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {masterCategories.map(mc => {
                              const value = `${MASTER_PREFIX}${mc.id}`;
                              return (
                                <TouchableOpacity key={mc.id} style={[mStyles.catPill, form.categoryId === value && mStyles.catPillActive]}
                                  onPress={() => setForm(f => ({ ...f, categoryId: value }))}>
                                  <Text style={[mStyles.catPillText, form.categoryId === value && mStyles.catPillTextActive]}>{mc.name}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </>
                    )}
                    {privateCategories.length > 0 && (
                      <>
                        <Text style={mStyles.categoryGroupLabel}>My Categories</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {privateCategories.map(c => (
                              <TouchableOpacity key={c.id} style={[mStyles.catPill, form.categoryId === c.id && mStyles.catPillActive]}
                                onPress={() => setForm(f => ({ ...f, categoryId: c.id }))}>
                                <Text style={[mStyles.catPillText, form.categoryId === c.id && mStyles.catPillTextActive]}>{c.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </>
                    )}
                  </>
                )}
                {(errors.categoryId || errors.newCategoryName) && !form.useNewCategory && <Text style={mStyles.errorText}>{errors.categoryId}</Text>}
                {errors.newCategoryName && form.useNewCategory && <Text style={mStyles.errorText}>{errors.newCategoryName}</Text>}
            </>

            {/* Pricing — matches web's field set exactly: Base Price (editable),
                Dashito Price (read-only, computed), Packaging Fee (read-only, admin-set). */}
            <View style={mStyles.row2}>
              <View style={{ flex: 1 }}>
                <SLabel>Base Price ₹ *</SLabel>
                <TextInput style={[mStyles.input, errors.basePrice && mStyles.inputError]} value={form.basePrice} onChangeText={set("basePrice")} placeholder="0" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
                {errors.basePrice && <Text style={mStyles.errorText}>{errors.basePrice}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <SLabel>Dashito Price ₹</SLabel>
                <View style={mStyles.readOnlyBox}>
                  <Text style={mStyles.readOnlyText}>{dashitoPriceDisplay}</Text>
                </View>
                <Text style={mStyles.categoryHint}>{dashitoPriceHint}</Text>
              </View>
            </View>

            <SLabel>Packaging Fee</SLabel>
            <View style={mStyles.readOnlyBox}>
              <Text style={mStyles.readOnlyText}>{packagingFeeDisplay}</Text>
            </View>
            <Text style={mStyles.categoryHint}>Fixed by Dashito — not vendor-editable</Text>

            {/* Primary Tag */}
            <SLabel>Food Type *</SLabel>
            <View style={mStyles.tagGrid}>
              {PRIMARY_TAGS.map(tag => {
                const tc = TAG_COLORS[tag] || TAG_COLORS.VEG;
                const isSelected = form.primaryTag === tag;
                return (
                  <TouchableOpacity key={tag}
                    style={[mStyles.tagPill, { borderColor: isSelected ? tc.text : "#e5e7eb", backgroundColor: isSelected ? tc.bg : "#fff" }]}
                    onPress={() => setForm(f => ({ ...f, primaryTag: tag }))}>
                    <Text style={[mStyles.tagPillText, { color: isSelected ? tc.text : "#9ca3af" }]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description */}
            <SLabel>Description</SLabel>
            <TextInput style={[mStyles.input, mStyles.textarea]} value={form.description} onChangeText={set("description")} placeholder="Brief description for customers…" placeholderTextColor="#d1d5db" multiline numberOfLines={3} />

            {/* Item Photo */}
            <SLabel>Item Photo</SLabel>
            <View style={mStyles.photoRow}>
              <TouchableOpacity onPress={handleImagePick} disabled={imageUploading} style={mStyles.photoBox}>
                {form.imageUrl ? (
                  <Image source={{ uri: form.imageUrl }} style={mStyles.photoImage} />
                ) : (
                  <Text style={mStyles.photoPlaceholder}>🍽️</Text>
                )}
                <View style={mStyles.photoOverlay}>
                  {imageUploading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={mStyles.photoOverlayIcon}>📷</Text>}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <TouchableOpacity onPress={handleImagePick} disabled={imageUploading}>
                  <Text style={mStyles.photoActionText}>{form.imageUrl ? "Change photo" : "Upload photo"}</Text>
                </TouchableOpacity>
                {form.imageUrl ? (
                  <TouchableOpacity onPress={removeImage} disabled={imageUploading}>
                    <Text style={mStyles.photoRemoveText}>Remove photo</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={mStyles.photoHint}>JPG or PNG, up to 5 MB</Text>
                )}
              </View>
            </View>

            <SDivider />

            {/* Jain Section */}
            <TouchableOpacity style={mStyles.collapseHeader} onPress={() => setShowJain(v => !v)}>
              <Text style={mStyles.collapseTitle}>🙏 Jain Details</Text>
              <Text style={mStyles.collapseChev}>{showJain ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {showJain && (
              <View style={mStyles.collapseBody}>
                {([
                  { key: "hasOnion",          label: "Contains Onion" },
                  { key: "hasGarlic",         label: "Contains Garlic" },
                  { key: "hasRootVegetables", label: "Has Root Vegetables" },
                  { key: "isStrictlyJain",    label: "Strictly Jain (no onion/garlic/root)" },
                  { key: "canCustomizeToJain",label: "Can be made Jain on request" },
                ] as const).map(item => (
                  <View key={item.key} style={mStyles.toggleRow}>
                    <Text style={mStyles.toggleLabel}>{item.label}</Text>
                    <Switch value={(form as any)[item.key]} onValueChange={tog(item.key)} trackColor={{ true: "#059669", false: "#e5e7eb" }} thumbColor="#fff" />
                  </View>
                ))}
                <SLabel>Jain Note (optional)</SLabel>
                <TextInput style={mStyles.input} value={form.jainNote} onChangeText={set("jainNote")} placeholder="e.g. Made in separate pan" placeholderTextColor="#d1d5db" />
              </View>
            )}

            <SDivider />

            {/* Health Section */}
            <TouchableOpacity style={mStyles.collapseHeader} onPress={() => setShowHealth(v => !v)}>
              <Text style={mStyles.collapseTitle}>💪 Health Flags</Text>
              <Text style={mStyles.collapseChev}>{showHealth ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {showHealth && (
              <View style={mStyles.collapseBody}>
                {([
                  { key: "isLowOil",      label: "Low Oil" },
                  { key: "isHighProtein", label: "High Protein" },
                  { key: "isSugarFree",   label: "Sugar Free" },
                  { key: "isLowCarb",     label: "Low Carb" },
                ] as const).map(item => (
                  <View key={item.key} style={mStyles.toggleRow}>
                    <Text style={mStyles.toggleLabel}>{item.label}</Text>
                    <Switch value={(form as any)[item.key]} onValueChange={tog(item.key)} trackColor={{ true: "#059669", false: "#e5e7eb" }} thumbColor="#fff" />
                  </View>
                ))}
              </View>
            )}

            <SDivider />

            {/* Nutrition Section */}
            <TouchableOpacity style={mStyles.collapseHeader} onPress={() => setShowNutrition(v => !v)}>
              <Text style={mStyles.collapseTitle}>📊 Nutrition Info</Text>
              <Text style={mStyles.collapseChev}>{showNutrition ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {showNutrition && (
              <View style={mStyles.collapseBody}>
                {([
                  [["calories", "Calories (kcal)"], ["protein",  "Protein (g)"]],
                  [["carbs",    "Carbs (g)"],        ["fat",      "Fat (g)"]],
                  [["fiber",    "Fiber (g)"],         ["sugar",    "Sugar (g)"]],
                ] as [string, string][][]).map((pair, i) => (
                  <View key={i} style={[mStyles.row2, { marginBottom: 0 }]}>
                    {pair.map(([key, label]) => (
                      <View key={key} style={{ flex: 1 }}>
                        <SLabel>{label}</SLabel>
                        <TextInput style={mStyles.input} value={(form as any)[key]} onChangeText={set(key)} placeholder="0" placeholderTextColor="#d1d5db" keyboardType="decimal-pad" />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={mStyles.footer}>
          <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={mStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[mStyles.submitBtn, saving && mStyles.submitBtnDisabled]} onPress={handleSubmit} disabled={saving}>
            <Text style={mStyles.submitText}>{saving ? "Saving…" : (isEdit ? "Update Item" : "Add Item")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ── Bulk Upload Modal ────────────────────────────────────────────────────── */

interface BulkUploadResult {
  created: number;
  skipped: number;
  errors: { row: number; item: string; reason: string }[];
  categoriesCreated: string[];
}

function BulkUploadModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  useEffect(() => {
    if (visible) { setPickedFile(null); setResult(null); }
  }, [visible]);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const token = await SecureStore.getItemAsync("vendor_access_token");
      const base = `${process.env.EXPO_PUBLIC_API_URL || "https://api.dashito.in"}/api/v1`;
      const dest = FileSystem.cacheDirectory + "dashito-menu-upload-template.xlsx";
      const { uri } = await FileSystem.downloadAsync(
        `${base}/vendor/menu/bulk-upload/template`,
        dest,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Save Menu Upload Template",
        });
      } else {
        Alert.alert("Downloaded", `Saved to ${uri}`);
      }
    } catch {
      Alert.alert("Error", "Could not download the template. Please try again later.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!["csv", "xlsx"].includes(ext)) {
        Alert.alert("Unsupported file", "Please choose a .csv or .xlsx file.");
        return;
      }
      setPickedFile({ uri: file.uri, name: file.name, mimeType: file.mimeType });
      setResult(null);
    } catch {
      Alert.alert("Error", "Could not read that file.");
    }
  };

  const handleUpload = async () => {
    if (!pickedFile) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", { uri: pickedFile.uri, name: pickedFile.name, type: pickedFile.mimeType || "application/octet-stream" } as any);
      const res = await api.post("/vendor/menu/bulk-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(res.data);
      if (res.data.created > 0) onSuccess();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Bulk upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={mStyles.container}>
        <View style={mStyles.header}>
          <View>
            <Text style={mStyles.title}>Bulk Upload Menu Items</Text>
            <Text style={mStyles.subtitle}>Add many items at once from a CSV or Excel file</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}>
            <Text style={mStyles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={mStyles.body} showsVerticalScrollIndicator={false}>
          <Text style={mStyles.collapseTitle}>Step 1 — Get the template</Text>
          <Text style={[mStyles.categoryHint, { marginBottom: 12 }]}>
            Download the template, fill in your menu items, then upload it back below.
          </Text>
          <TouchableOpacity onPress={handleDownloadTemplate} disabled={downloading} style={bStyles.downloadBtn}>
            {downloading
              ? <ActivityIndicator size="small" color="#059669" />
              : <Text style={bStyles.downloadBtnText}>⬇ Download Template (.xlsx)</Text>}
          </TouchableOpacity>

          <View style={{ height: 20 }} />

          <Text style={mStyles.collapseTitle}>Step 2 — Upload it back</Text>
          <TouchableOpacity onPress={handlePickFile} disabled={uploading} style={bStyles.pickBtn}>
            <Text style={bStyles.pickBtnText} numberOfLines={1}>
              {pickedFile ? pickedFile.name : "Choose a .csv or .xlsx file…"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleUpload}
            disabled={!pickedFile || uploading}
            style={[mStyles.submitBtn, { marginTop: 12 }, (!pickedFile || uploading) && mStyles.submitBtnDisabled]}
          >
            {uploading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={mStyles.submitText}>Upload File</Text>}
          </TouchableOpacity>

          {result && (
            <View style={{ marginTop: 20 }}>
              <Text style={mStyles.collapseTitle}>Result</Text>
              <View style={[bStyles.resultBox, bStyles.resultSuccess]}>
                <Text style={bStyles.resultSuccessText}>✓ {result.created} item{result.created === 1 ? "" : "s"} added</Text>
              </View>
              {result.categoriesCreated?.length > 0 && (
                <Text style={[mStyles.categoryHint, { marginTop: 8 }]}>
                  New categories created: {result.categoriesCreated.join(", ")}
                </Text>
              )}
              {result.errors?.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <View style={[bStyles.resultBox, bStyles.resultWarning]}>
                    <Text style={bStyles.resultWarningText}>⚠ {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped</Text>
                  </View>
                  {result.errors.map((e, i) => (
                    <View key={i} style={bStyles.errorRow}>
                      <Text style={bStyles.errorRowTitle}>Row {e.row} — {e.item}</Text>
                      <Text style={bStyles.errorRowReason}>{e.reason}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>

        <View style={mStyles.footer}>
          <TouchableOpacity style={[mStyles.cancelBtn, { flex: 1 }]} onPress={onClose}>
            <Text style={mStyles.cancelText}>{result ? "Done" : "Cancel"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const bStyles = StyleSheet.create({
  downloadBtn: { backgroundColor: "#f0fdf4", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  downloadBtnText: { color: "#059669", fontSize: 14, fontWeight: "700" },
  pickBtn: { borderWidth: 1.5, borderColor: "#e5e7eb", borderStyle: "dashed", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, alignItems: "flex-start" },
  pickBtnText: { fontSize: 13, color: "#374151" },
  resultBox: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  resultSuccess: { backgroundColor: "#f0fdf4" },
  resultSuccessText: { color: "#059669", fontSize: 13, fontWeight: "700" },
  resultWarning: { backgroundColor: "#fffbeb" },
  resultWarningText: { color: "#d97706", fontSize: 13, fontWeight: "700" },
  errorRow: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 8 },
  errorRowTitle: { fontSize: 12, fontWeight: "700", color: "#374151" },
  errorRowReason: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
});

function SLabel({ children }: { children: React.ReactNode }) {
  return <Text style={mStyles.label}>{children}</Text>;
}
function SDivider() { return <View style={{ height: 1, backgroundColor: "#f3f4f6", marginVertical: 16 }} />; }

const mStyles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#fff" },
  header:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 20, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  title:       { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle:    { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  closeBtn:    { padding: 4 },
  closeIcon:   { fontSize: 18, color: "#9ca3af" },
  body:        { padding: 20, paddingBottom: 20 },
  label:       { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input:       { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#111827" },
  inputError:  { borderColor: "#ef4444" },
  errorText:   { fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: "600" },
  categoryHint:{ fontSize: 11, color: "#9ca3af", marginTop: 4 },
  categoryGroupLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  readOnlyBox: { borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  readOnlyText:{ fontSize: 14, fontWeight: "700", color: "#b45309" },
  textarea:    { minHeight: 72, textAlignVertical: "top" },
  photoRow:    { flexDirection: "row", alignItems: "center", gap: 14 },
  photoBox:    { width: 64, height: 64, borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#f9fafb", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImage:  { width: "100%", height: "100%" },
  photoPlaceholder: { fontSize: 22 },
  photoOverlay: { position: "absolute", bottom: 0, right: 0, left: 0, height: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  photoOverlayIcon: { fontSize: 11 },
  photoActionText: { fontSize: 13, fontWeight: "700", color: "#059669" },
  photoRemoveText: { fontSize: 12, fontWeight: "600", color: "#ef4444", marginTop: 6 },
  photoHint:   { fontSize: 11, color: "#9ca3af", marginTop: 4 },
  row2:        { flexDirection: "row", gap: 10 },
  segRow:      { flexDirection: "row", gap: 10, marginBottom: 8 },
  seg:         { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  segActive:   { borderColor: "#059669", backgroundColor: "#f0fdf4" },
  segText:     { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  segTextActive:{ color: "#059669" },
  catPill:     { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  catPillActive:{ borderColor: "#059669", backgroundColor: "#059669" },
  catPillText: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  catPillTextActive:{ color: "#fff" },
  tagGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  tagPill:     { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  tagPillText: { fontSize: 12, fontWeight: "700" },
  collapseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  collapseTitle:  { fontSize: 14, fontWeight: "700", color: "#374151" },
  collapseChev:   { fontSize: 12, color: "#9ca3af" },
  collapseBody:   { paddingBottom: 8 },
  toggleRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  toggleLabel: { fontSize: 14, color: "#374151", flex: 1 },
  footer:      { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  cancelBtn:   { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelText:  { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  submitBtn:   { flex: 2, backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { opacity: 0.6 },
  submitText:  { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f9fafb" },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  headerTitle:  { fontSize: 20, fontWeight: "700", color: "#111827" },
  headerSub:    { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  addBtn:       { backgroundColor: "#059669", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText:   { color: "#fff", fontWeight: "600", fontSize: 13 },
  bulkBtn:      { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  bulkBtnText:  { color: "#374151", fontWeight: "600", fontSize: 13 },

  searchRow:    { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  searchInput:  { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: "#111827", backgroundColor: "#f9fafb" },
  searchClear:  { marginLeft: 8, padding: 6 },
  searchClearText: { fontSize: 14, color: "#9ca3af" },

  filterScroll: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", maxHeight: 50 },
  filterContent:{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: "center" },
  filterChip:   { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#fff" },
  filterChipActive: { backgroundColor: "#059669", borderColor: "#059669" },
  filterChipText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  filterChipTextActive: { color: "#fff" },

  clearFiltersText: { fontSize: 13, color: "#059669", fontWeight: "600", marginTop: 8 },

  category:     { marginBottom: 20 },
  categoryTitle:{ fontSize: 14, fontWeight: "700", color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  itemRow:      { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#f3f4f6" },
  itemRowUnavailable: { opacity: 0.5 },
  itemInfo:     { flex: 1, marginRight: 12 },
  itemNameRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  itemName:     { fontSize: 14, fontWeight: "600", color: "#111827" },
  itemNameGray: { color: "#9ca3af" },
  verifiedBadge:{ backgroundColor: "#f0fdf4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  verifiedText: { fontSize: 10, color: "#16a34a", fontWeight: "600" },
  itemMeta:     { flexDirection: "row", alignItems: "center", gap: 8 },
  itemPrice:    { fontSize: 14, fontWeight: "700", color: "#111827" },
  tagBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText:      { fontSize: 11, fontWeight: "600" },
  scoreBadge:   { backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  scoreText:    { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText:    { fontSize: 16, fontWeight: "600", color: "#374151" },
  emptySubtext: { fontSize: 13, color: "#9ca3af", marginTop: 4, textAlign: "center", paddingHorizontal: 24 },
  retryBtn:     { marginTop: 16, backgroundColor: "#059669", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
