"use client";

import { useState } from "react";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { ConversationThread } from "@/types/chat";

interface Props {
    threads: ConversationThread[];
    activeId: string | null;
    disabled: boolean;
    hasMore: boolean;
    onSelect: (id: string) => void;
    onNew: () => Promise<void>;
    onRename: (id: string, title: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onLoadMore: () => void;
}

export function ConversationToolbar({ threads, activeId, disabled, hasMore, onSelect, onNew, onRename, onDelete, onLoadMore }: Props) {
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const active = threads.find((t) => t.id === activeId);
    const buttonStyle = "p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:pointer-events-none";
    return <div className="border-b border-zinc-800 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
            <select aria-label="Conversation" value={activeId ?? ""} disabled={disabled || saving}
                onChange={(event) => { setEditing(false); setDeleting(false); onSelect(event.target.value); }}
                className="min-w-0 flex-1 bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
                {!activeId && <option value="">New conversation</option>}
                {threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
            </select>
            <button type="button" title="New conversation" aria-label="New conversation" disabled={disabled || saving}
                onClick={async () => { setEditing(false); setDeleting(false); setSaving(true);
                    try { await onNew(); } finally { setSaving(false); } }} className={buttonStyle}><MessageSquarePlus size={18} /></button>
            <button type="button" title="Rename conversation" aria-label="Rename conversation" disabled={disabled || saving || !active}
                onClick={() => { setTitle(active?.title ?? ""); setEditing(true); setDeleting(false); }} className={buttonStyle}><Pencil size={16} /></button>
            <button type="button" title="Delete conversation" aria-label="Delete conversation" disabled={disabled || saving || !active}
                onClick={() => { setDeleting(true); setEditing(false); }} className={buttonStyle}><Trash2 size={16} /></button>
        </div>
        {hasMore && <button type="button" disabled={disabled} onClick={onLoadMore} className="text-xs text-indigo-400 mt-2">Load older conversations</button>}
        {editing && activeId && <form className="flex gap-2 mt-2" onSubmit={async (event) => {
            event.preventDefault();
            if (!title.trim() || saving) return;
            setSaving(true);
            try { await onRename(activeId, title.trim()); setEditing(false); }
            finally { setSaving(false); }
        }}>
            <input autoFocus aria-label="Conversation name" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            <button type="submit" disabled={saving || !title.trim()} className="text-sm text-indigo-400 disabled:opacity-40">Save</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="text-sm text-zinc-400">Cancel</button>
        </form>}
        {deleting && activeId && <div className="mt-2 text-xs text-zinc-300 flex flex-wrap items-center gap-3" role="alert">
            <span>Delete this conversation and all its messages?</span>
            <button type="button" disabled={saving} className="text-red-400" onClick={async () => {
                setSaving(true);
                try { await onDelete(activeId); setDeleting(false); }
                finally { setSaving(false); }
            }}>Delete</button>
            <button type="button" disabled={saving} onClick={() => setDeleting(false)}>Cancel</button>
        </div>}
    </div>;
}
