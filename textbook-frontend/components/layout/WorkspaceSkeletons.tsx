import { Skeleton } from "@/components/ui/skeleton";

export function SidebarListSkeleton({ kind, count = 5 }: { kind: "chats" | "sources"; count?: number }) {
    return <div role="status" aria-label={`Loading ${kind}`} className="flex flex-col gap-2">
        <span className="sr-only">Loading {kind}…</span>
        {Array.from({ length: count }, (_, index) => (
            <div key={index} aria-hidden="true" className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-3">
                <Skeleton className={kind === "sources" ? "size-8 shrink-0" : "size-4 shrink-0"} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className={index % 2 === 0 ? "h-3 w-4/5" : "h-3 w-3/5"} />
                    {kind === "sources" && <Skeleton className="h-2 w-2/5" />}
                </div>
            </div>
        ))}
    </div>;
}

export function MessageSkeleton({ label = "Loading conversation" }: { label?: string }) {
    return <div role="status" aria-label={label} className="mx-auto flex w-full max-w-[820px] flex-col gap-8 py-4">
        <span className="sr-only">{label}…</span>
        <div aria-hidden="true" className="ml-auto flex w-3/5 flex-col gap-2 rounded-2xl border border-border/50 p-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
        </div>
        <div aria-hidden="true" className="flex w-full flex-col gap-3">
            <Skeleton className="mb-2 size-7 rounded-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-1/2" />
        </div>
    </div>;
}

export function ConversationSkeleton() {
    return <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
        <div className="min-h-0 flex-1 overflow-hidden px-5 py-7 sm:px-8">
            <MessageSkeleton />
        </div>
        <div aria-hidden="true" className="mx-auto w-full max-w-[884px] shrink-0 px-5 pb-6 sm:px-8">
            <div className="flex h-28 flex-col justify-between rounded-2xl border border-border/50 p-4">
                <Skeleton className="h-3 w-2/5" />
                <div className="flex items-center justify-between">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="size-8 rounded-full" />
                </div>
            </div>
        </div>
    </div>;
}
