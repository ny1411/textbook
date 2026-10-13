"use client";

import ChatInterface from "@/components/chat/ChatInterface";
import { Header } from "@/components/layout/Header";
import { StudioPanel } from "@/components/layout/StudioPanel";
import { RetrievalInspectorModal } from "@/components/search/RetrievalInspectorModal";
import { SidebarSources } from "@/components/sources/SidebarSources";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useEffect, useState } from "react";

export default function Home() {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const { isInspectorOpen, setInspectorOpen, workspaceUserId, activeNotebookId } = useTextbookStore();

  useEffect(() => {
    if (!isSourceOpen && !isStudioOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setIsSourceOpen(false);
      setIsStudioOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSourceOpen, isStudioOpen]);

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-background text-foreground antialiased">
      <Header
        textbookTitle="AI Engineering"
        isStudioOpen={isStudioOpen}
        isSourceOpen={isSourceOpen}
        onToggleStudio={() => {
          setIsStudioOpen((open) => !open);
          setIsSourceOpen(false);
        }}
        onToggleSources={() => {
          setIsSourceOpen((open) => !open);
          setIsStudioOpen(false);
        }}
      />
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {/* Backdrop overlay for mobile/tablet when either sidebar is open */}
        {(isSourceOpen || isStudioOpen) && (
          <button
            type="button"
            aria-label="Close workspace panel"
            tabIndex={-1}
            onClick={() => {
              setIsSourceOpen(false);
              setIsStudioOpen(false);
            }}
            className={`fixed inset-0 top-16 bg-black/60 z-30 ${isStudioOpen ? "xl:hidden" : "lg:hidden"}`}
          />
        )}

        {/* Left Panel */}
        <aside
          id="sources-panel"
          aria-label="Sources"
          className={`
            fixed lg:static top-16 bottom-0 left-0 z-40
            w-[280px] max-w-[85vw] shrink-0 bg-background border-r border-border overflow-y-auto
            transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0 lg:visible
            ${isSourceOpen ? "translate-x-0 visible" : "-translate-x-full invisible"}
          `}
          data-lenis-prevent
        >
          <SidebarSources />
        </aside>

        {/* Center Panel */}
        <section aria-label="Research chat" className="research-canvas flex-1 min-w-0 flex flex-col h-full relative" data-lenis-prevent>
          <ChatInterface onCitationClick={(citation) => {
            useTextbookStore.getState().setActiveCitation(citation);
            useTextbookStore.getState().setActiveStudioTab("citation");
            setIsStudioOpen(true);
            setIsSourceOpen(false);
          }} />
        </section>

        {/* Right Panel */}
          {isStudioOpen ? (
            <aside
              id="studio-panel"
              aria-label="Studio"
              className="fixed xl:static top-16 bottom-0 right-0 z-40 w-96 max-w-[90vw] shrink-0 bg-background border-l border-border overflow-y-auto"
              data-lenis-prevent
            >
              <StudioPanel key={`${workspaceUserId}:${activeNotebookId}`} />
            </aside>
          ) : null}
      </main>
      <RetrievalInspectorModal
        key={`${workspaceUserId}:${activeNotebookId}`}
        isOpen={isInspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}
