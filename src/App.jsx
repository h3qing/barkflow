import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import { X } from "lucide-react";
import { useToast } from "./components/ui/Toast";
import { LoadingDots } from "./components/ui/LoadingDots";
import { useHotkey } from "./hooks/useHotkey";
import { formatHotkeyLabel } from "./utils/hotkeys";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSettingsStore } from "./stores/settingsStore";

// BarkFlow Indicator — black soundbar with realistic dog ears, mic icon, red dot
// Matches the user's mockup: [mic] |||||||||||| [●]  with ears on top
const BarkFlowIndicator = ({ state = 'idle', size = 48, animated = false, speaking = false }) => {
  // Ear perk: taller when speaking/recording
  const earH = speaking ? 20 : (state === 'recording' ? 16 : 12);
  const earOp = state === 'idle' ? 0.7 : 1;
  const isActive = state === 'recording' || state === 'processing';

  return (
    <svg width={220} height={56} viewBox="0 0 220 56" fill="none">
      {/* === Left ear (positioned ~1/3 from left edge, on top of bar) === */}
      {/* Outer ear shape — like Mando's: tall, pointed, slightly curved */}
      <path
        d={`M 48 32 C 48 32 42 ${32 - earH + 4} 38 ${32 - earH} C 37 ${32 - earH - 2} 38 ${32 - earH - 3} 40 ${32 - earH - 1} C 43 ${32 - earH + 2} 52 26 54 32 Z`}
        fill="#8B5E3C"
        opacity={earOp}
        style={{ transition: 'all 0.2s ease-out' }}
      />
      {/* Ear inner (pinkish/lighter) */}
      <path
        d={`M 49 31 C 49 31 44 ${33 - earH + 4} 41 ${33 - earH + 1} C 40.5 ${33 - earH} 41.5 ${33 - earH - 0.5} 42.5 ${33 - earH + 0.5} C 44 ${33 - earH + 2} 51 27 52 31 Z`}
        fill="#C4956A"
        opacity={earOp * 0.6}
        style={{ transition: 'all 0.2s ease-out' }}
      />
      {/* Dark edge (fur shadow) */}
      <path
        d={`M 47 32 C 47 32 43 ${33 - earH + 5} 39 ${33 - earH + 1} C 38 ${33 - earH} 38 ${33 - earH - 1} 39 ${33 - earH - 0.5}`}
        stroke="#5C3A1E"
        strokeWidth="1"
        fill="none"
        opacity={earOp * 0.5}
        style={{ transition: 'all 0.2s ease-out' }}
      />

      {/* === Right ear (positioned ~1/3 from right edge) === */}
      <path
        d={`M 172 32 C 172 32 178 ${32 - earH + 4} 182 ${32 - earH} C 183 ${32 - earH - 2} 182 ${32 - earH - 3} 180 ${32 - earH - 1} C 177 ${32 - earH + 2} 168 26 166 32 Z`}
        fill="#8B5E3C"
        opacity={earOp}
        style={{ transition: 'all 0.2s ease-out' }}
      />
      <path
        d={`M 171 31 C 171 31 176 ${33 - earH + 4} 179 ${33 - earH + 1} C 179.5 ${33 - earH} 178.5 ${33 - earH - 0.5} 177.5 ${33 - earH + 0.5} C 176 ${33 - earH + 2} 169 27 168 31 Z`}
        fill="#C4956A"
        opacity={earOp * 0.6}
        style={{ transition: 'all 0.2s ease-out' }}
      />
      <path
        d={`M 173 32 C 173 32 177 ${33 - earH + 5} 181 ${33 - earH + 1} C 182 ${33 - earH} 182 ${33 - earH - 1} 181 ${33 - earH - 0.5}`}
        stroke="#5C3A1E"
        strokeWidth="1"
        fill="none"
        opacity={earOp * 0.5}
        style={{ transition: 'all 0.2s ease-out' }}
      />

      {/* === Soundbar (translucent, blends with background) === */}
      <rect x="8" y="30" width="204" height="22" rx="11" fill="rgba(0,0,0,0.35)" />

      {/* Mic icon (left side) — subtle when idle */}
      <circle cx="24" cy="41" r="4" fill="none" stroke="white" strokeWidth="1.2" opacity={speaking ? 0.8 : 0.3} />
      <rect x="23" y="37" width="2" height="5" rx="1" fill="white" opacity={speaking ? 0.8 : 0.3} />
      <line x1="24" y1="46" x2="24" y2="48" stroke="white" strokeWidth="1" opacity={speaking ? 0.6 : 0.2} />

      {/* Recording dot (right side) — red only when speaking */}
      <circle cx="196" cy="41" r="3.5" fill={speaking ? "#EF4444" : "#666"} opacity={speaking ? 1 : 0.2}>
        {speaking && <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />}
      </circle>

      {/* === Waveform bars — only animated when SPEAKING, quiet otherwise === */}
      {[60, 66, 72, 78, 84, 90, 96, 102, 108, 114, 120, 126, 132, 138, 144, 150, 156].map((x, i) => {
        // Bars are tall + animated only when speaking, minimal otherwise
        const quietH = 2; // tiny dots when not speaking
        const activeH = [3, 5, 7, 9, 11, 14, 12, 15, 12, 14, 11, 9, 7, 9, 7, 5, 3][i];
        const h = speaking ? Math.min(18, activeH + 4) : quietH;
        const color = speaking && i % 3 === 1 ? '#93C5FD' : 'white';

        return (
          <rect
            key={i}
            x={x}
            y={30 + (22 - h) / 2}
            width={3}
            rx={1.5}
            height={Math.max(2, h)}
            fill={color}
            opacity={speaking ? 0.9 : 0.25}
            className={speaking ? 'animate-pulse' : ''}
            style={speaking ? { animationDelay: `${i * 0.04}s`, animationDuration: '0.5s' } : {}}
          />
        );
      })}
    </svg>
  );
};

// Tooltip Component
const Tooltip = ({ children, content, emoji, align = "center" }) => {
  const [isVisible, setIsVisible] = useState(false);

  const alignClass =
    align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";

  const arrowClass =
    align === "right" ? "right-3" : align === "left" ? "left-3" : "left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        {children}
      </div>
      {isVisible && (
        <div
          className={`absolute bottom-full ${alignClass} mb-2 px-1.5 py-1 text-[10px] text-popover-foreground bg-popover border border-border rounded-md z-10 shadow-lg transition-opacity duration-150 whitespace-nowrap`}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {content}
          <div
            className={`absolute top-full ${arrowClass} w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-popover`}
          ></div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const commandMenuRef = useRef(null);
  const buttonRef = useRef(null);
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { hotkey } = useHotkey();
  const { isDragging, handleMouseDown, handleMouseUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const panelStartPosition = useSettingsStore((s) => s.panelStartPosition);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: data.message,
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const unsubscribeAccessibility = window.electronAPI?.onAccessibilityMissing?.(() => {
      toast({
        title: t("app.toasts.accessibilityMissing.title"),
        description: t("app.toasts.accessibilityMissing.description"),
        duration: 12000,
      });
    });

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `\u201c${w}\u201d`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                  // silently fail — word stays in dictionary
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-emerald-100/90 hover:text-white
                bg-emerald-500/15 hover:bg-emerald-500/25
                border border-emerald-400/20 hover:border-emerald-400/35
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeAccessibility?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isCommandMenuOpen || toastCount > 0) {
      setWindowInteractivity(true);
    } else if (!isHovered) {
      setWindowInteractivity(false);
    }
  }, [isCommandMenuOpen, isHovered, toastCount, setWindowInteractivity]);

  useEffect(() => {
    const resizeWindow = () => {
      if (isCommandMenuOpen && toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isCommandMenuOpen) {
        window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else {
        window.electronAPI?.resizeMainWindow?.("BASE");
      }
    };
    resizeWindow();
  }, [isCommandMenuOpen, toastCount]);

  const handleDictationToggle = React.useCallback(() => {
    setIsCommandMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const { isRecording, isProcessing, toggleListening, cancelRecording, cancelProcessing } =
    useAudioRecording(toast, {
      onToggle: handleDictationToggle,
    });

  // Sync auto-hide from main process — setState directly to avoid IPC echo
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      // Delay briefly so processing can start after recording stops without a flash
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsCommandMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCommandMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (isCommandMenuOpen) {
          setIsCommandMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isCommandMenuOpen]);

  // Determine current mic state
  const getMicState = () => {
    if (isRecording) return "recording";
    if (isProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing) return "hover";
    return "idle";
  };

  const micState = getMicState();

  const getMicButtonProps = () => {
    // BarkFlow: no background on button — the SVG indicator IS the visual
    const baseClasses =
      "w-auto h-auto flex items-center justify-center relative overflow-visible cursor-pointer";

    switch (micState) {
      case "idle":
      case "hover":
        return {
          className: `${baseClasses} opacity-70 hover:opacity-100 transition-opacity`,
          tooltip: formatHotkeyLabel(hotkey),
        };
      case "recording":
        return {
          className: `${baseClasses}`,
          tooltip: t("app.mic.recording"),
        };
      case "processing":
        return {
          className: `${baseClasses} opacity-80 cursor-not-allowed`,
          tooltip: t("app.mic.processing"),
        };
      default:
        return {
          className: `${baseClasses} opacity-60`,
          tooltip: t("app.mic.clickToSpeak"),
        };
    }
  };

  const micProps = getMicButtonProps();

  return (
    <div className="dictation-window">
      {/* Voice button - position determined by panelStartPosition setting */}
      <div
        className={`fixed bottom-1 z-50 ${
          panelStartPosition === "bottom-left"
            ? "left-1"
            : panelStartPosition === "center"
              ? "left-1/2 -translate-x-1/2"
              : "right-1"
        }`}
      >
        <div
          className="relative flex items-center gap-2"
          onMouseEnter={() => {
            setIsHovered(true);
            setWindowInteractivity(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isCommandMenuOpen) {
              setWindowInteractivity(false);
            }
          }}
        >
          {(isRecording || isProcessing) && isHovered && (
            <button
              aria-label={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              onClick={(e) => {
                e.stopPropagation();
                isRecording ? cancelRecording() : cancelProcessing();
              }}
              className="group/cancel w-5 h-5 rounded-full bg-surface-2/90 hover:bg-destructive border border-border hover:border-destructive/70 flex items-center justify-center transition-colors duration-150 shadow-sm backdrop-blur-sm"
            >
              <X
                size={10}
                strokeWidth={2.5}
                className="text-foreground group-hover/cancel:text-destructive-foreground transition-colors duration-150"
              />
            </button>
          )}
          <Tooltip
            content={micProps.tooltip}
            align={
              panelStartPosition === "bottom-left"
                ? "left"
                : panelStartPosition === "center"
                  ? "center"
                  : "right"
            }
          >
            <button
              ref={buttonRef}
              onMouseDown={(e) => {
                setIsCommandMenuOpen(false);
                setDragStartPos({ x: e.clientX, y: e.clientY });
                setHasDragged(false);
                handleMouseDown(e);
              }}
              onMouseMove={(e) => {
                if (dragStartPos && !hasDragged) {
                  const distance = Math.sqrt(
                    Math.pow(e.clientX - dragStartPos.x, 2) +
                      Math.pow(e.clientY - dragStartPos.y, 2)
                  );
                  if (distance > 5) {
                    // 5px threshold for drag
                    setHasDragged(true);
                  }
                }
              }}
              onMouseUp={(e) => {
                handleMouseUp(e);
                setDragStartPos(null);
              }}
              onClick={(e) => {
                if (!hasDragged) {
                  setIsCommandMenuOpen(false);
                  toggleListening();
                }
                e.preventDefault();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!hasDragged) {
                  setWindowInteractivity(true);
                  setIsCommandMenuOpen((prev) => !prev);
                }
              }}
              onFocus={() => setIsHovered(true)}
              onBlur={() => setIsHovered(false)}
              className={micProps.className}
              style={{
                ...micProps.style,
                cursor:
                  micState === "processing"
                    ? "not-allowed !important"
                    : isDragging
                      ? "grabbing !important"
                      : "pointer !important",
                transition:
                  "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease-out",
              }}
            >
              {/* BarkFlow indicator — soundbar with dog head, no extra chrome */}
              {micState === "idle" || micState === "hover" ? (
                <BarkFlowIndicator state="idle" size={16} />
              ) : micState === "recording" ? (
                <BarkFlowIndicator state="recording" size={16} animated={true} speaking={isRecording} />
              ) : micState === "processing" ? (
                <BarkFlowIndicator state="processing" size={16} animated={true} />
              ) : null}
            </button>
          </Tooltip>
          {isCommandMenuOpen && (
            <div
              ref={commandMenuRef}
              className="absolute bottom-full right-0 mb-3 w-48 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-sm"
              onMouseEnter={() => {
                setWindowInteractivity(true);
              }}
              onMouseLeave={() => {
                if (!isHovered) {
                  setWindowInteractivity(false);
                }
              }}
            >
              <button
                className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  toggleListening();
                }}
              >
                {isRecording
                  ? t("app.commandMenu.stopListening")
                  : t("app.commandMenu.startListening")}
              </button>
              <div className="h-px bg-border" />
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  setIsCommandMenuOpen(false);
                  setWindowInteractivity(false);
                  handleClose();
                }}
              >
                {t("app.commandMenu.hideForNow")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
