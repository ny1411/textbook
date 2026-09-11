"use client";

import { ChatInput } from "@/components/chat/ChatInput";
import { Header } from "@/components/layout/Header";
import { useState } from "react";

export default function Home() {
  const [isStudioOpen, setIsStudioOpen] = useState(true);
  const [textbookTitle, setTextbookTitle] = useState("AI Engineering");
  const [userAvatar, setUserAvatar] = useState("N");

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-zinc-900 text-zinc-100 antialiased">
      <Header
        textbookTitle={textbookTitle}
        isStudioOpen={isStudioOpen}
        onToggleStudio={() => setIsStudioOpen(!isStudioOpen)}
        userAvatar={userAvatar}
        onOpenInspector={() => { }}
      />
      <main className="flex-1 flex overflow-hidden">
        <div className="w-72 lg:w-80 shrink-0 border-r border-zinc-700 overflow-y-auto" data-lenis-prevent>Left Panel (sources)</div>
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col relative" data-lenis-prevent>
          <div className="flex-1"></div>
          <ChatInput onSend={(query, isAgent) => console.log("Sent:", { query, isAgent })} />
        </div>
        {isStudioOpen && (
          <div className="w-80 lg:w-96 shrink-0 border-l border-zinc-700 overflow-y-auto" data-lenis-prevent>Right panel</div>
        )}
      </main>
    </div>
  );
}
