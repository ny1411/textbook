import { create } from "zustand";

const DEFAULT_USER_ID = "default_user";

export interface UserProfile {
    id: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
}

interface UserState {
    userId: string;
    user: UserProfile | null;
    isAuthenticated: boolean;
    setUser: (user: UserProfile | null) => void;
    clearUser: () => void;
}


export const useUserStore = create<UserState>((set) => ({
    userId: DEFAULT_USER_ID,
    user: null,
    isAuthenticated: false,
    setUser: (user) => set({
        userId: user ? user.id : DEFAULT_USER_ID,
        user,
        isAuthenticated: !!user,
    }),
    clearUser: () => set({
        userId: DEFAULT_USER_ID,
        user: null,
        isAuthenticated: false,
    })
}))