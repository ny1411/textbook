import { UserProfile } from "@/stores/useUserStore";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface UserMenuProps {
    user: UserProfile | null;
    onSignOut: () => void;
    onOpenSettings?: () => void;
}

export function UserMenu({ user, onSignOut, onOpenSettings }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const closeOutside = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        window.addEventListener("pointerdown", closeOutside);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", closeOutside);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [isOpen]);

    const userInitials = user?.name
        ? user?.name.slice(0, 1).toUpperCase()
        : user?.email?.slice(0, 1).toUpperCase() || "R";
    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-accent/40 bg-surface transition-colors hover:border-accent"
                aria-label="Open account menu"
                aria-expanded={isOpen}
                aria-controls="account-menu"
                title="Account"
            >
                {user?.avatarUrl ? (
                    <Image
                        src={user.avatarUrl}
                        width={28}
                        height={28}
                        unoptimized
                        alt={user?.name || "Avatar"}
                        className="size-full object-cover"
                    />
                ) : (
                    <span className="text-xs font-medium text-accent">
                        {userInitials}
                    </span>
                )}
            </button>
            {isOpen && (
                <>
                    <div
                        id="account-menu"
                        className="absolute right-0 top-12 z-50 flex w-60 flex-col items-start rounded-xl border border-border bg-background p-3 text-sm shadow-xl"
                    >
                        <div className="mb-2 w-full border-b border-border px-2 pb-3">
                            <p className="truncate text-xs text-foreground">{user?.name || "Researcher"}</p>
                            <p className="mt-1 truncate text-[11px] text-muted">{user?.email}</p>
                        </div>
                        {onOpenSettings ? <button
                            type="button"
                            className="w-full rounded-lg px-2 py-2 text-start text-xs text-muted transition-colors hover:bg-surface hover:text-foreground"
                            onClick={() => {
                                setIsOpen(false);
                                onOpenSettings?.();
                            }}
                        >
                            <span>
                                Settings
                            </span>
                        </button> : null}
                        {/* Sign Out Button */}
                        <button
                            type="button"
                            className="w-full rounded-lg px-2 py-2 text-start text-xs text-muted transition-colors hover:bg-surface hover:text-foreground"
                            onClick={() => {
                                setIsOpen(false);
                                onSignOut();
                            }}
                        >
                            <span>Sign Out</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
