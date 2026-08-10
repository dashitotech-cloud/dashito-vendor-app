import axios from "axios";
import * as SecureStore from "expo-secure-store";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL || "https://api.dashito.in"}/api/v1`;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,   // 20s — matches server REQUEST_TIMEOUT with headroom
  headers: { "Accept-Encoding": "gzip" },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("vendor_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync("vendor_refresh_token");
        if (refreshToken) {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          await SecureStore.setItemAsync("vendor_access_token", data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }
      } catch {
        // refresh failed — fall through to clear
      }
      await SecureStore.deleteItemAsync("vendor_access_token");
      await SecureStore.deleteItemAsync("vendor_refresh_token");
    }
    return Promise.reject(err);
  }
);
