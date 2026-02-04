// hooks/useNotificationStore.ts
import { create } from "zustand";

export interface JoinLeaveEvent {
  id: string;
  message: string;
  type: "join" | "leave";
}

interface NotificationState {
  events: JoinLeaveEvent[];
  pushEvent: (message: string, type: "join" | "leave") => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  events: [],
  pushEvent: (message, type) => {
    const id = `${Date.now()}-${Math.random()}`;
    const newEvent: JoinLeaveEvent = { id, message, type };

    set((state) => ({
      events: [newEvent, ...state.events].slice(0, 5), // keep latest 5
    }));

    // Auto-remove after 2 seconds
    setTimeout(() => {
      set((state) => ({
        events: state.events.filter((e) => e.id !== id),
      }));
    }, 2000);
  },
}));
