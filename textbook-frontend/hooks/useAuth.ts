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
        supabase.auth.getUser().then(({ data: { user } }) => {
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
            subscription.unsubscribe();
        }
    }, [setUser, clearUser]);

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