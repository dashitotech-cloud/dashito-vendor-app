/**
 * Vendor App — Schedule Screen
 * Manage restaurant open/close days and operating hours.
 * Accessible from the bottom tab bar after login.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Switch,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, StatusBar,
} from "react-native";
import { api } from "../lib/api";

interface DaySchedule {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SCHEDULE: DaySchedule[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  isOpen: true,
  openTime: "09:00",
  closeTime: "22:00",
}));

function isValidTime(t: string | null): boolean {
  if (!t) return false;
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function ScheduleScreen() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const res = await api.get("/vendor/schedule");
      setSchedule(res.data.schedule);
    } catch {
      Alert.alert("Error", "Could not load schedule");
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (idx: number) => {
    setSchedule(prev =>
      prev.map((d, i) => i === idx ? { ...d, isOpen: !d.isOpen } : d)
    );
    setSavedAt(null);
    setDayErrors(prev => { const { [schedule[idx].dayOfWeek]: _, ...rest } = prev; return rest; });
  };

  const setTime = (idx: number, field: "openTime" | "closeTime", val: string) => {
    setSchedule(prev =>
      prev.map((d, i) => i === idx ? { ...d, [field]: val } : d)
    );
    setSavedAt(null);
    setDayErrors(prev => { const { [schedule[idx].dayOfWeek]: _, ...rest } = prev; return rest; });
  };

  const applyToAllOpen = (idx: number) => {
    const src = schedule[idx];
    setSchedule(prev =>
      prev.map(d => d.isOpen ? { ...d, openTime: src.openTime, closeTime: src.closeTime } : d)
    );
    setSavedAt(null);
  };

  const saveSchedule = async () => {
    const errs: Record<number, string> = {};
    for (const day of schedule) {
      if (day.isOpen) {
        if (!isValidTime(day.openTime) || !isValidTime(day.closeTime)) {
          errs[day.dayOfWeek] = "Enter valid HH:MM times";
        } else if (day.openTime! >= day.closeTime!) {
          errs[day.dayOfWeek] = "Opening time must be before closing time";
        }
      }
    }
    setDayErrors(errs);
    if (Object.keys(errs).length) {
      const names = Object.keys(errs).map(d => DAY_FULL[Number(d)]).join(", ");
      Alert.alert("Fix Invalid Days", `Please correct the highlighted times for: ${names}.`);
      return;
    }
    setSaving(true);
    try {
      await api.put("/vendor/schedule", { schedule });
      setSavedAt(new Date());
    } catch {
      Alert.alert("Error", "Could not save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const summary = useCallback((): string => {
    const open = schedule.filter(d => d.isOpen);
    if (open.length === 0) return "Closed all week";
    if (open.length === 7) {
      const allSame = open.every(
        d => d.openTime === open[0].openTime && d.closeTime === open[0].closeTime
      );
      if (allSame) return `Every day · ${open[0].openTime} – ${open[0].closeTime}`;
      return "Open every day · varying hours";
    }
    const closedNames = schedule.filter(d => !d.isOpen).map(d => DAY_SHORT[d.dayOfWeek]);
    return `Closed on ${closedNames.join(", ")}`;
  }, [schedule]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Loading schedule…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Operating Hours</Text>
        {savedAt && (
          <Text style={styles.savedBadge}>
            Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        )}
      </View>

      {/* Summary pill */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryDots}>
          {schedule.map(d => (
            <View
              key={d.dayOfWeek}
              style={[styles.dot, { backgroundColor: d.isOpen ? "#059669" : "#e5e7eb" }]}
            />
          ))}
        </View>
        <Text style={styles.summaryText}>{summary()}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {schedule.map((day, idx) => (
          <View key={day.dayOfWeek} style={[styles.dayCard, dayErrors[day.dayOfWeek] && styles.dayCardError]}>
            {/* Day toggle row */}
            <View style={styles.dayHeaderRow}>
              <Switch
                value={day.isOpen}
                onValueChange={() => toggleDay(idx)}
                trackColor={{ true: "#059669", false: "#e5e7eb" }}
                thumbColor="#fff"
                style={styles.switch}
              />
              <Text style={[styles.dayName, !day.isOpen && styles.dayNameClosed]}>
                {DAY_FULL[day.dayOfWeek]}
              </Text>
              {day.isOpen ? (
                <View style={styles.openBadge}>
                  <Text style={styles.openBadgeText}>Open</Text>
                </View>
              ) : (
                <View style={styles.closedBadge}>
                  <Text style={styles.closedBadgeText}>Closed</Text>
                </View>
              )}
            </View>

            {/* Time inputs — shown only when open */}
            {day.isOpen && (
              <View style={styles.timeSection}>
                <View style={styles.timeFields}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>Opens at</Text>
                    <TextInput
                      style={[
                        styles.timeInput,
                        !isValidTime(day.openTime) && day.openTime !== null && styles.timeInputError,
                      ]}
                      value={day.openTime || ""}
                      onChangeText={v => setTime(idx, "openTime", v)}
                      placeholder="09:00"
                      placeholderTextColor="#d1d5db"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      returnKeyType="next"
                    />
                  </View>

                  <Text style={styles.timeSep}>–</Text>

                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>Closes at</Text>
                    <TextInput
                      style={[
                        styles.timeInput,
                        !isValidTime(day.closeTime) && day.closeTime !== null && styles.timeInputError,
                      ]}
                      value={day.closeTime || ""}
                      onChangeText={v => setTime(idx, "closeTime", v)}
                      placeholder="22:00"
                      placeholderTextColor="#d1d5db"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.applyAllBtn}
                  onPress={() => applyToAllOpen(idx)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.applyAllText}>Apply to all{"\n"}open days</Text>
                </TouchableOpacity>
              </View>
            )}
            {dayErrors[day.dayOfWeek] && (
              <Text style={styles.dayErrorText}>{dayErrors[day.dayOfWeek]}</Text>
            )}
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky save button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={saveSchedule}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Schedule</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: "#f9fafb" },
  center:        { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:   { color: "#6b7280", fontSize: 14 },

  // Header
  header:        {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  headerTitle:   { fontSize: 20, fontWeight: "800", color: "#111827" },
  savedBadge:    {
    fontSize: 12, color: "#059669", fontWeight: "600",
    backgroundColor: "#f0fdf4", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: "#bbf7d0",
  },

  // Summary
  summaryRow:    {
    backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
    flexDirection: "column", gap: 8,
  },
  summaryDots:   { flexDirection: "row", gap: 6 },
  dot:           { width: 24, height: 24, borderRadius: 12 },
  summaryText:   { fontSize: 13, color: "#6b7280", fontWeight: "500" },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },

  // Day card
  dayCard:       {
    backgroundColor: "#fff", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#f3f4f6",
  },
  dayCardError:  { borderColor: "#ef4444" },
  dayErrorText:  { fontSize: 12, color: "#ef4444", fontWeight: "600", marginTop: 10 },
  dayHeaderRow:  { flexDirection: "row", alignItems: "center", gap: 12 },
  switch:        { transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] },
  dayName:       { flex: 1, fontSize: 16, fontWeight: "700", color: "#111827" },
  dayNameClosed: { color: "#9ca3af" },
  openBadge:     {
    backgroundColor: "#f0fdf4", paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1, borderColor: "#bbf7d0",
  },
  openBadgeText: { fontSize: 12, color: "#059669", fontWeight: "600" },
  closedBadge:   {
    backgroundColor: "#f9fafb", paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1, borderColor: "#e5e7eb",
  },
  closedBadgeText: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },

  // Time section
  timeSection:   { marginTop: 14, flexDirection: "row", alignItems: "flex-end", gap: 10 },
  timeFields:    { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  timeBlock:     { flex: 1 },
  timeLabel:     { fontSize: 11, color: "#6b7280", fontWeight: "500", marginBottom: 6 },
  timeInput:     {
    borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 12,
    fontSize: 18, fontWeight: "700", color: "#111827",
    textAlign: "center", letterSpacing: 2, backgroundColor: "#fafafa",
  },
  timeInputError: { borderColor: "#fca5a5", backgroundColor: "#fff5f5" },
  timeSep:       { fontSize: 18, color: "#9ca3af", paddingBottom: 12 },
  applyAllBtn:   {
    backgroundColor: "#f0fdf4", borderRadius: 10, paddingHorizontal: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: "#bbf7d0", alignItems: "center",
  },
  applyAllText:  { fontSize: 10, fontWeight: "700", color: "#059669", textAlign: "center", lineHeight: 15 },

  // Footer
  footer:        {
    backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: "#f3f4f6",
  },
  saveBtn:       {
    backgroundColor: "#059669", borderRadius: 14, paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:   { color: "#fff", fontSize: 16, fontWeight: "700" },
});
