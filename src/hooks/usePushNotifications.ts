/**
 * Registers for push notifications, gets the FCM device token,
 * and uploads it to the API so the server can send targeted pushes.
 *
 * Requires google-services.json in android/app/ — the function is
 * a no-op (no error thrown) if Firebase is not configured on device.
 */

import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "../lib/api";

// Foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

export function usePushNotifications(isLoggedIn: boolean, onNewOrderTapped?: () => void) {
  useEffect(() => {
    if (!isLoggedIn) return;
    registerForPush().catch(() => {});
  }, [isLoggedIn]);

  // Tapping a "New Order!" push (foreground, background, or cold-start) jumps
  // straight to the Orders tab so the vendor doesn't have to hunt for it.
  useEffect(() => {
    if (!isLoggedIn || !onNewOrderTapped) return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'NEW_ORDER') onNewOrderTapped();
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (data?.type === 'NEW_ORDER') onNewOrderTapped();
    });

    return () => sub.remove();
  }, [isLoggedIn, onNewOrderTapped]);
}

async function registerForPush() {
  // Ask permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  // Android: create a high-priority notification channel for orders
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("dashito_orders", {
      name:            "Orders",
      importance:      Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound:           "default",
      lightColor:      "#059669",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd:       false,
    });
  }

  // Get raw FCM device token (requires google-services.json)
  const tokenData = await Notifications.getDevicePushTokenAsync();
  if (!tokenData?.data) return;

  // Register with backend
  await api.post("/users/me/fcm-token", { token: tokenData.data });
}
