"use client";

import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/useUserStore";
import { useEffect } from "react";

export function useAuth() {
    const user = useUserStore((s) => s.user);
    const isAuthenticated = useUserStore((s) => s.isAuthenticated);

    const setUser = useUserStore((s) => s.setUser);
    const clearUser = useUserStore((s) => s.clearUser);
    const supabase = createClient();

    useEffect(() => {
        let disposed = false;
        let authVersion = 0;
        const initialVersion = authVersion;
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (disposed || authVersion !== initialVersion) return;
            if (user) {
                setUser({
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata?.full_name
                        || user.user_metadata?.name
                        || user.email?.split("@")[0],
                    avatarUrl: user.user_metadata?.avatarUrl,
                });
            } else {
                clearUser();
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (disposed) return;
            authVersion++;
            if (session?.user) {
                const user = session.user;
                setUser({
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata?.full_name
                        || user.user_metadata?.name
                        || user.email?.split("@")[0],
                    avatarUrl: user.user_metadata?.avatar_url
                        || user.user_metadata?.picture,
                });
            } else {
                clearUser();
            }
        });

        return () => {
            disposed = true;
            subscription.unsubscribe();
        }
    }, [setUser, clearUser, supabase]);

    const signInWithProvider = async (provider: "google" | "github") => {
        await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            }
        })
    }

    const signOut = async () => {
        await supabase.auth.signOut();
        clearUser();
    }

    return { user, isAuthenticated, signInWithProvider, signOut };
}
