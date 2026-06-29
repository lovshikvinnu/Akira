import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/components/akira/Shell";
import { GhostButton } from "@/components/akira/primitives";
import { useAkira, akira } from "@/services/akira-store";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — AKIRA" },
      { name: "description", content: "Talk to AKIRA — mock responses until the AI is wired in." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const messages = useAkira((s) => s.chat);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · CHAT"
        title="Talk to AKIRA"
        subtitle="Mock responses today. Full AI mode is coming."
        action={
          <GhostButton
            onClick={() => {
              akira.clearChat();
              toast.success("Conversation cleared");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </GhostButton>
        }
      />

      <section className="mt-8 grid grid-cols-12 gap-5">
        <div className="glass-card col-span-12 flex h-[60vh] flex-col p-0">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[78%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet/40 to-electric/30 px-4 py-3 text-sm text-foreground shadow-[0_8px_24px_-10px_oklch(0.55_0.22_290_/_0.4)]"
                      : "max-w-[78%] rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-foreground/90"
                  }
                >
                  {m.role === "akira" && (
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-glow">
                      <Sparkles className="h-3 w-3" /> AKIRA
                    </div>
                  )}
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              akira.sendChat(draft);
              setDraft("");
            }}
            className="flex items-center gap-2 border-t border-white/[0.06] p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message AKIRA…"
              className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none transition-colors focus:border-violet/60"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="btn-glow inline-flex h-11 items-center gap-2 px-5 text-sm font-medium disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Send
            </button>
          </form>
        </div>
      </section>
    </Shell>
  );
}
