import { create } from "zustand";

const DEFAULT_USER_ID = "default_user";

interface UserState {
    userId: string;
    setUserId: (id: string) => void;
}

export const useUserStore = create<UserState>((set) =>({
    userId: DEFAULT_USER_ID,
    setUserId: (userId) => set({userId}),
}))