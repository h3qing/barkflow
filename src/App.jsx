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

// BarkFlow Indicator — horizontal soundbar with Mando's dog head on top
// The bar sits at the bottom of the screen. Mando's head + ears sit on top,
// partially peeking above. Ears perk up when the user is actively speaking.
const BarkFlowIndicator = ({ state = 'idle', size = 48, animated = false, speaking = false }) => {
  // Ears respond to SPEAKING (voice activity), not just mic on/off
  const earPerk = speaking ? -2 : (state === 'recording' ? -5 : -8);
  const earSpread = speaking ? 4 : (state === 'recording' ? 6 : 10);

  return (
    <svg width={size * 3} height={size} viewBox="0 0 144 48" fill="none">
      {/* === Soundbar (bottom half) === */}
      <rect x="0" y="28" width="144" height="20" rx="10" fill="rgba(0,0,0,0.5)" />

      {/* Waveform bars inside the soundbar */}
      {[12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116, 124].map((x, i) => {
        const baseH = [3, 5, 7, 9, 11, 13, 11, 13, 11, 9, 7, 9, 7, 5, 3][i];
        const activeH = speaking
          ? baseH + Math.sin(i * 0.8) * 4 + 4  // more dynamic when speaking
          : state === 'recording'
            ? baseH + 2
            : baseH;
        const h = Math.max(3, Math.min(16, activeH));

        return (
          <rect
            key={i}
            x={x}
            y={28 + (20 - h) / 2}
            width={4}
            rx={2}
            height={h}
            fill="white"
            opacity={speaking ? 0.95 : 0.6}
            className={animated && state === 'recording' ? 'animate-pulse' : ''}
            style={animated ? { animationDelay: `${i * 0.05}s`, animationDuration: '0.6s' } : {}}
          />
        );
      })}

      {/* === Dog head (sits on top of soundbar) === */}
      {/* Head shape */}
      <ellipse cx="72" cy="24" rx="16" ry="14" fill="#D97706" opacity="0.85" />
      {/* Snout */}
      <ellipse cx="72" cy="30" rx="8" ry="5" fill="#C2740C" opacity="0.6" />
      {/* Nose */}
      <ellipse cx="72" cy="28" rx="3" ry="2" fill="#1a1a1a" opacity="0.8" />
      {/* Eyes */}
      <circle cx="65" cy="22" r="2" fill="#1a1a1a" opacity="0.9" />
      <circle cx="79" cy="22" r="2" fill="#1a1a1a" opacity="0.9" />
      {/* Eye highlights */}
      <circle cx="65.7" cy="21.3" r="0.7" fill="white" opacity="0.8" />
      <circle cx="79.7" cy="21.3" r="0.7" fill="white" opacity="0.8" />

      {/* === Mando's ears (tall pointed, perk when speaking) === */}
      {/* Left ear */}
      <path
        d={`M 58 18 C 58 18 54 ${earPerk + 6} 52 ${earPerk} C 51.5 ${earPerk - 1.5} 52.5 ${earPerk - 2} 53.5 ${earPerk - 1} C 55 ${earPerk + 1} 60 12 62 18 Z`}
        fill="#D97706"
        style={{
          transform: `rotate(${-earSpread}deg)`,
          transformOrigin: '58px 18px',
          transition: 'all 0.2s ease-out',
        }}
      />
      {/* Left ear inner */}
      <path
        d={`M 58.5 17 C 58.5 17 55.5 ${earPerk + 8} 54 ${earPerk + 3} C 53.8 ${earPerk + 2} 54.5 ${earPerk + 2} 55 ${earPerk + 3} C 56 ${earPerk + 4} 59 13 60 17 Z`}
        fill="#F59E0B"
        opacity="0.4"
        style={{
          transform: `rotate(${-earSpread}deg)`,
          transformOrigin: '58px 18px',
          transition: 'all 0.2s ease-out',
        }}
      />

      {/* Right ear */}
      <path
        d={`M 86 18 C 86 18 90 ${earPerk + 6} 92 ${earPerk} C 92.5 ${earPerk - 1.5} 91.5 ${earPerk - 2} 90.5 ${earPerk - 1} C 89 ${earPerk + 1} 84 12 82 18 Z`}
        fill="#D97706"
        style={{
          transform: `rotate(${earSpread}deg)`,
          transformOrigin: '86px 18px',
          transition: 'all 0.2s ease-out',
        }}
      />
      {/* Right ear inner */}
      <path
        d={`M 85.5 17 C 85.5 17 88.5 ${earPerk + 8} 90 ${earPerk + 3} C 90.2 ${earPerk + 2} 89.5 ${earPerk + 2} 89 ${earPerk + 3} C 88 ${earPerk + 4} 85 13 84 17 Z`}
        fill="#F59E0B"
        opacity="0.4"
        style={{
          transform: `rotate(${earSpread}deg)`,
          transformOrigin: '86px 18px',
          transition: 'all 0.2s ease-out',
        }}
      />
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
    const baseClasses =
      "rounded-full w-auto h-12 px-2 flex items-center justify-center relative overflow-visible cursor-pointer";

    switch (micState) {
      case "idle":
      case "hover":
        return {
          className: `${baseClasses} bg-black/40 cursor-pointer`,
          tooltip: formatHotkeyLabel(hotkey),
        };
      case "recording":
        return {
          className: `${baseClasses} bg-amber-600 cursor-pointer`,
          tooltip: t("app.mic.recording"),
        };
      case "processing":
        return {
          className: `${baseClasses} bg-amber-700 cursor-not-allowed`,
          tooltip: t("app.mic.processing"),
        };
      default:
        return {
          className: `${baseClasses} bg-black/40 cursor-pointer`,
          style: { transform: "scale(0.8)" },
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
              {/* Background effects */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent transition-opacity duration-150"
                style={{ opacity: micState === "hover" ? 0.8 : 0 }}
              ></div>
              <div
                className="absolute inset-0 transition-colors duration-150"
                style={{
                  backgroundColor: micState === "hover" ? "rgba(0,0,0,0.1)" : "transparent",
                }}
              ></div>

              {/* Dynamic content based on state — dog head + soundbar */}
              {micState === "idle" || micState === "hover" ? (
                <BarkFlowIndicator state="idle" size={16} />
              ) : micState === "recording" ? (
                <BarkFlowIndicator state="recording" size={16} animated={true} speaking={isRecording} />
              ) : micState === "processing" ? (
                <BarkFlowIndicator state="processing" size={16} animated={true} />
              ) : null}

              {/* State indicator ring for recording */}
              {micState === "recording" && (
                <div className="absolute inset-0 rounded-full border-2 border-amber-500/50 animate-pulse"></div>
              )}

              {/* State indicator ring for processing */}
              {micState === "processing" && (
                <div className="absolute inset-0 rounded-full border-2 border-amber-500/30 opacity-50"></div>
              )}
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
