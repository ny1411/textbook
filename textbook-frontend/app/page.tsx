"use client";

import { ChatInput } from "@/components/chat/ChatInput";
import { Header } from "@/components/layout/Header";
import { SidebarSources } from "@/components/sources/SidebarSources";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export default function Home() {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [textbookTitle, setTextbookTitle] = useState("AI Engineering");
  const [userAvatar, setUserAvatar] = useState("N");

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-zinc-900 text-zinc-100 antialiased">
      <Header
        textbookTitle={textbookTitle}
        isStudioOpen={isStudioOpen}
        isSourceOpen={isSourceOpen}
        onToggleStudio={() => setIsStudioOpen(!isStudioOpen)}
        onToggleSources={() => setIsSourceOpen(!isSourceOpen)}
        userAvatar={userAvatar}
        onOpenInspector={() => { }}
      />
      <main className="flex-1 flex overflow-hidden">
        {/* Backdrop overlay for mobile/tablet when either sidebar is open */}
        {(isSourceOpen || isStudioOpen) && (
          <div
            onClick={() => {
              setIsSourceOpen(false);
              setIsStudioOpen(false);
            }}
            className="fixed inset-0 top-12 bg-black/50 z-30 lg:hidden backdrop-blur-xs"
          />
        )}

        {/* Left Panel */}
        <motion.aside
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
          <div className="flex-1 overflow-y-auto p-4">
            {/* Chat history will render here */}
          </div>
          <ChatInput onSend={(query, isAgent) => console.log("Sent:", { query, isAgent })} />
        </section>

        {/* Right Panel */}
        <AnimatePresence>
          {isStudioOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.1,
                ease: [0, 0.71, 0.2, 1.01],
              }}
              className={`
              fixed lg:static top-12 bottom-0 right-0 z-40
              bg-zinc-900 border-zinc-700 overflow-y-auto
              ${isStudioOpen
                  ? "w-80 lg:w-96 translate-x-0 border-l"
                  : "w-80 translate-x-full lg:w-0 lg:translate-x-0 lg:border-l-0 lg:overflow-hidden"
                }
              `}
              data-lenis-prevent
            >
              {/* Inner container with fixed width prevents text squishing while collapsing */}
              <div className="p-4">
                Right panel (studio)
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
