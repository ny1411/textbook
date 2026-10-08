import { create } from "zustand";
import { useSourceStore } from "./useSourcesStore";
import { useTextbookStore } from "./useTextbookStore";

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


export const useUserStore = create<UserState>((set, get) => ({
    userId: DEFAULT_USER_ID,
    user: null,
    isAuthenticated: false,
    setUser: (user) => {
        const nextId = user ? user.id : DEFAULT_USER_ID;
        if (get().userId !== nextId) {
            useSourceStore.getState().replaceSources([]);
        }
        useTextbookStore.getState().setWorkspaceUserId(user?.id ?? null);
        set({
        userId: user ? user.id : DEFAULT_USER_ID,
        user,
        isAuthenticated: !!user,
        });
    },
    clearUser: () => get().setUser(null),
}))
