import { UserProfile } from "@/stores/useUserStore";
import { LogOut } from "lucide-react";
import { useState } from "react";

interface UserMenuProps {
    user: UserProfile | null;
    onSignOut: () => void;
    onOpenSettings?: () => void;
}

export function UserMenu({ user, onSignOut, onOpenSettings }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const userInitials = user?.name
        ? user?.name.slice(0, 1).toUpperCase()
        : user?.email?.slice(0, 1).toUpperCase();
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="size-7 rounded-full bg-indigo-600/20 border border-indigo-500/40 hover:ring-2 hover:ring-indigo-500/40 flex items-center justify-center transition-all cursor-pointer overflow-hidden"
                title="Account Settings"
            >
                {user?.avatarUrl ? (
                    <img
                        src={user.avatarUrl}
                        alt={user?.name || "Avatar"}
                        className="size-full object-cover"
                    />
                ) : (
                    <span className="text-xs font-semibold text-indigo-400">
                        {userInitials}
                    </span>
                )}
            </button>
            {isOpen && (
                <>
                    <div
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 z-40"
                    />
                    <div
                        className="absolute flex flex-col justify-start items-start 
                        right-0 top-9 z-50 w-60 text-sm rounded-2xl 
                        border border-zinc-700/80 bg-zinc-900/95 
                        backdrop-blur-md p-4 shadow-2xl 
                        animate-in fade-in zoom-in-95 duration-150"
                    >
                        <button
                            className="hover:bg-gray-600/10 px-2 py-1.5 w-full rounded-lg text-start text-zinc-300 transition-colors cursor-pointer"
                            onClick={() => {
                                setIsOpen(false);
                                onOpenSettings?.();
                            }}
                        >
                            <span>
                                Settings
                            </span>
                        </button>
                        {/* Sign Out Button */}
                        <button
                            className="hover:bg-gray-600/10 px-2 py-1.5 w-full rounded-lg text-start text-zinc-300 transition-colors cursor-pointer"
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
