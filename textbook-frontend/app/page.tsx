"use client";

import ChatInterface from "@/components/chat/ChatInterface";
import { Header } from "@/components/layout/Header";
import { StudioPanel } from "@/components/layout/StudioPanel";
import { RetrievalInspectorModal } from "@/components/search/RetrievalInspectorModal";
import { SidebarSources } from "@/components/sources/SidebarSources";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export default function Home() {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [textbookTitle] = useState("AI Engineering");
  const [userAvatar] = useState("N");

  const { isInspectorOpen, setInspectorOpen } = useTextbookStore();

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-zinc-900 text-zinc-100 antialiased">
      <Header
        textbookTitle={textbookTitle}
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
        userAvatar={userAvatar}
      />
      <main className="flex-1 flex overflow-hidden">
        {/* Backdrop overlay for mobile/tablet when either sidebar is open */}
        {(isSourceOpen || isStudioOpen) && (
          <div
            onClick={() => {
              setIsSourceOpen(false);
              setIsStudioOpen(false);
            }}
            className={`fixed inset-0 top-12 bg-black/50 z-30 backdrop-blur-xs ${isStudioOpen ? "xl:hidden" : "lg:hidden"}`}
          />
        )}

        {/* Left Panel */}
        <motion.aside
          aria-label="Sources"
          animate={{ x: isSourceOpen ? 0 : "-100%" }}
          transition={{
            duration: 0.5,
            delay: 0.1,
            ease: [0, 0.71, 0.2, 1.01],
          }}
          className={`
            fixed lg:static top-12 bottom-0 left-0 z-40
            w-72 lg:w-80 shrink-0 bg-zinc-900 border-r border-zinc-700 overflow-y-auto
            lg:!transform-none
          `}
          data-lenis-prevent
        >
          <SidebarSources />
        </motion.aside>

        {/* Center Panel */}
        <section className="flex-1 min-w-0 flex flex-col h-full relative" data-lenis-prevent>
          <ChatInterface onCitationClick={(citation) => {
            useTextbookStore.getState().setActiveCitation(citation);
            useTextbookStore.getState().setActiveStudioTab("citation");
            setIsStudioOpen(true);
            setIsSourceOpen(false);
          }} />
        </section>

        {/* Right Panel */}
        <AnimatePresence>
          {isStudioOpen && (
            <motion.aside
              aria-label="Studio"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.1,
                ease: [0, 0.71, 0.2, 1.01],
              }}
              className={`
              fixed xl:static top-12 bottom-0 right-0 z-40 shrink-0 max-w-[100vw]
              bg-zinc-900 border-zinc-700 overflow-y-auto
              ${isStudioOpen
                  ? "w-80 xl:w-96 translate-x-0 border-l"
                  : "w-80 translate-x-full xl:w-0 xl:translate-x-0 xl:border-l-0 xl:overflow-hidden"
                }
              `}
              data-lenis-prevent
            >
              <StudioPanel />
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
      <RetrievalInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}
