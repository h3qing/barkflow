import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "./lib/utils";
import { AgentTitleBar } from "./agent/AgentTitleBar";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import AudioManager from "../helpers/audioManager";
import ReasoningService from "../services/ReasoningService";
import { getSettings } from "../stores/settingsStore";
import { getAgentSystemPrompt } from "../config/prompts";

type AgentState = "idle" | "listening" | "transcribing" | "thinking" | "streaming";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
}

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1000;
const WIDTH = 420;

export default function AgentOverlay() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [partialTranscript, setPartialTranscript] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const audioManagerRef = useRef<InstanceType<typeof AudioManager> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const agentStateRef = useRef<AgentState>("idle");
  const conversationIdRef = useRef<number | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  const addSystemMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "assistant" as const, content, isStreaming: false },
    ]);
  }, []);

  const handleTranscriptionComplete = useCallback(async (text: string) => {
    if (!text.trim()) {
      setAgentState("idle");
      return;
    }

    // Create conversation on first message
    if (!conversationIdRef.current) {
      const conv = await window.electronAPI?.createAgentConversation?.("New conversation");
      conversationIdRef.current = conv?.id ?? null;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      isStreaming: false,
    };
    setMessages((prev) => [...prev, userMsg]);

    if (conversationIdRef.current) {
      window.electronAPI?.addAgentMessage?.(conversationIdRef.current, "user", text);
    }

    // Auto-title after first user message
    const allMessages = messagesRef.current;
    if (conversationIdRef.current && allMessages.length === 0) {
      const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
      window.electronAPI?.updateAgentConversationTitle?.(conversationIdRef.current, title);
    }

    setAgentState("thinking");

    const settings = getSettings();
    const systemPrompt = getAgentSystemPrompt();

    const llmMessages = [
      { role: "system", content: systemPrompt },
      ...[...allMessages, userMsg].slice(-20).map((m) => ({ role: m.role, content: m.content })),
    ];

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ]);
    setAgentState("streaming");

    const isCloudAgent = settings.isSignedIn && settings.cloudAgentMode === "openwhispr";

    try {
      let fullContent = "";

      const streamSource = isCloudAgent
        ? ReasoningService.processTextStreamingCloud(llmMessages, { systemPrompt })
        : ReasoningService.processTextStreaming(
            llmMessages,
            settings.agentModel,
            settings.agentProvider,
            { systemPrompt }
          );

      for await (const chunk of streamSource) {
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
        );
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );

      if (conversationIdRef.current) {
        window.electronAPI?.addAgentMessage?.(conversationIdRef.current, "assistant", fullContent);
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${(error as Error).message}`, isStreaming: false }
            : m
        )
      );
    }

    setAgentState("idle");
  }, []);

  useEffect(() => {
    const am = new AudioManager();
    am.setSkipReasoning(true);
    am.setContext("agent");
    am.setCallbacks({
      onStateChange: ({
        isRecording,
        isProcessing,
      }: {
        isRecording: boolean;
        isProcessing: boolean;
      }) => {
        if (isRecording) setAgentState("listening");
        else if (isProcessing) setAgentState("transcribing");
      },
      onError: (error: { message?: string }) => {
        const msg = error?.message || (typeof error === "string" ? error : "Transcription failed");
        addSystemMessage(`Error: ${msg}`);
        setAgentState("idle");
      },
      onTranscriptionComplete: (result: { text: string }) => {
        handleTranscriptionComplete(result.text);
      },
      onPartialTranscript: (text: string) => {
        setPartialTranscript(text);
      },
      onStreamingCommit: undefined,
    });
    audioManagerRef.current = am;
    return () => {
      window.removeEventListener("api-key-changed", (am as any)._onApiKeyChanged);
    };
  }, [addSystemMessage, handleTranscriptionComplete]);

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentHeightRef = useRef<number>(0);

  const resizeToContent = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Find the scrollable chat container
    const chatEl = el.querySelector(".agent-chat-scroll") as HTMLElement;
    if (!chatEl) return;

    const chatContent = chatEl.firstElementChild as HTMLElement;
    if (!chatContent) return;

    // Empty state has h-full class — skip resize to avoid oscillation
    if (chatContent.classList.contains("h-full")) return;

    // Measure the actual message list height + chat padding
    const chatStyle = getComputedStyle(chatEl);
    const chatPadding =
      parseFloat(chatStyle.paddingTop || "0") + parseFloat(chatStyle.paddingBottom || "0");
    const contentHeight = chatContent.scrollHeight + chatPadding;

    // Title bar (h-8 = 32px) + chat content + Input (h-12 = 48px) + borders (~2px)
    const desiredHeight = 32 + contentHeight + 48 + 2;
    const height = Math.max(MIN_HEIGHT, Math.min(Math.ceil(desiredHeight), MAX_HEIGHT));

    // Skip if height hasn't meaningfully changed
    if (Math.abs(height - lastSentHeightRef.current) < 4) return;
    lastSentHeightRef.current = height;

    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      window.electronAPI?.resizeAgentWindow?.(WIDTH, height);
    }, 50);
  }, []);

  useEffect(() => {
    resizeToContent();
  }, [messages, agentState, resizeToContent]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      resizeToContent();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [resizeToContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.electronAPI?.hideAgentOverlay?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const unsubStart = window.electronAPI?.onAgentStartRecording?.(() => {
      audioManagerRef.current?.startRecording();
    });

    const unsubStop = window.electronAPI?.onAgentStopRecording?.(() => {
      audioManagerRef.current?.stopRecording();
    });

    const unsubToggle = window.electronAPI?.onAgentToggleRecording?.(() => {
      const state = agentStateRef.current;
      if (state === "listening") {
        audioManagerRef.current?.stopRecording();
      } else if (state === "idle") {
        audioManagerRef.current?.startRecording();
      }
    });

    return () => {
      unsubStart?.();
      unsubStop?.();
      unsubToggle?.();
    };
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setAgentState("idle");
    setPartialTranscript("");
    conversationIdRef.current = null;
    lastSentHeightRef.current = 0;
    window.electronAPI?.resizeAgentWindow?.(WIDTH, MIN_HEIGHT);
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.hideAgentOverlay?.();
  }, []);

  return (
    <div className="agent-overlay-window w-screen h-screen bg-transparent">
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col w-full h-full",
          "bg-surface-1/75 backdrop-blur-2xl",
          "border border-border/40 rounded-lg",
          "shadow-[var(--shadow-elevated)]",
          "overflow-hidden"
        )}
      >
        <AgentTitleBar onNewChat={handleNewChat} onClose={handleClose} />
        <AgentChat messages={messages} />
        <AgentInput agentState={agentState} partialTranscript={partialTranscript} />
      </div>
    </div>
  );
}
