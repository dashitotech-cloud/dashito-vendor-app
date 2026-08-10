import { create } from "zustand";

interface VendorState {
  accessToken: string | null;
  userId: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  isOpen: boolean;
  setAuth: (token: string, userId?: string, restaurantId?: string, restaurantName?: string) => void;
  setRestaurant: (id: string, name: string, isOpen: boolean) => void;
  setStoreOpen: (open: boolean) => void;
  logout: () => void;
}

export const useVendorStore = create<VendorState>((set) => ({
  accessToken: null,
  userId: null,
  restaurantId: null,
  restaurantName: null,
  isOpen: false,
  setAuth: (token, userId, restaurantId, restaurantName) => set({
    accessToken: token,
    userId: userId || null,
    restaurantId: restaurantId || null,
    restaurantName: restaurantName || null,
  }),
  setRestaurant: (id, name, isOpen) => set({ restaurantId: id, restaurantName: name, isOpen }),
  setStoreOpen: (open) => set({ isOpen: open }),
  logout: () => set({ accessToken: null, userId: null, restaurantId: null, restaurantName: null }),
}));
