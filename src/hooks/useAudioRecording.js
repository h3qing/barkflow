import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AudioManager from "../helpers/audioManager";
import logger from "../utils/logger";
import { playStartCue, playStopCue } from "../utils/dictationCues";
import { getSettings } from "../stores/settingsStore";
import { getRecordingErrorTitle } from "../utils/recordingErrors";

export const useAudioRecording = (toast, options = {}) => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const audioManagerRef = useRef(null);
  const startLockRef = useRef(false);
  const stopLockRef = useRef(false);
  const { onToggle } = options;

  const performStartRecording = useCallback(async () => {
    if (startLockRef.current) return false;
    startLockRef.current = true;
    try {
      if (!audioManagerRef.current) return false;

      const currentState = audioManagerRef.current.getState();
      if (currentState.isRecording || currentState.isProcessing) return false;

      // Retry STT config fetch if it wasn't loaded on mount (e.g. auth wasn't ready)
      if (!audioManagerRef.current.sttConfig) {
        const config = await window.electronAPI.getSttConfig?.();
        if (config?.success) {
          audioManagerRef.current.setSttConfig(config);
        }
      }

      const didStart = audioManagerRef.current.shouldUseStreaming()
        ? await audioManagerRef.current.startStreamingRecording()
        : await audioManagerRef.current.startRecording();

      if (didStart) {
        if (getSettings().pauseMediaOnDictation) {
          window.electronAPI?.pauseMediaPlayback?.();
        }
        void playStartCue();
      }

      return didStart;
    } finally {
      startLockRef.current = false;
    }
  }, []);

  const performStopRecording = useCallback(async () => {
    if (stopLockRef.current) return false;
    stopLockRef.current = true;
    try {
      if (!audioManagerRef.current) return false;

      const currentState = audioManagerRef.current.getState();
      if (!currentState.isRecording && !currentState.isStreamingStartInProgress) return false;

      if (currentState.isStreaming || currentState.isStreamingStartInProgress) {
        void playStopCue();
        return await audioManagerRef.current.stopStreamingRecording();
      }

      const didStop = audioManagerRef.current.stopRecording();

      if (didStop) {
        void playStopCue();
      }

      return didStop;
    } finally {
      stopLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    audioManagerRef.current = new AudioManager();

    audioManagerRef.current.setCallbacks({
      onStateChange: ({ isRecording, isProcessing, isStreaming }) => {
        setIsRecording(isRecording);
        setIsProcessing(isProcessing);
        setIsStreaming(isStreaming ?? false);
        if (!isStreaming) {
          setPartialTranscript("");
        }
      },
      onError: (error) => {
        const title = getRecordingErrorTitle(error, t);
        toast({
          title,
          description: error.description,
          variant: "destructive",
          duration: error.code === "AUTH_EXPIRED" ? 8000 : undefined,
        });
        if (getSettings().pauseMediaOnDictation) {
          window.electronAPI?.resumeMediaPlayback?.();
        }
      },
      onPartialTranscript: (text) => {
        setPartialTranscript(text);
      },
      onTranscriptionComplete: async (result) => {
        if (getSettings().pauseMediaOnDictation) {
          window.electronAPI?.resumeMediaPlayback?.();
        }

        if (result.success) {
          const transcribedText = result.text?.trim();

          if (!transcribedText) {
            return;
          }

          // BarkFlow: Ollama text polish (if available)
          let textToPaste = result.text;
          let rawText = result.rawText ?? result.text;
          try {
            const polishPreset = localStorage.getItem("barkflow-polish-preset") || "clean";
            const polishResult = await window.electronAPI?.barkflowOllamaPolish?.(
              transcribedText,
              { preset: polishPreset }
            );
            if (polishResult?.polished && polishResult.text) {
              rawText = transcribedText;
              textToPaste = polishResult.text;
              logger.info(
                "BarkFlow Ollama polish applied",
                {
                  inputLen: transcribedText.length,
                  outputLen: polishResult.text.length,
                  elapsed: polishResult.elapsed,
                },
                "barkflow"
              );

              // BarkFlow: Learning mode — show polish before/after
              const captureCount = parseInt(localStorage.getItem("barkflow_capture_count") || "0", 10);
              const isLearningMode = captureCount < 20;
              localStorage.setItem("barkflow_capture_count", String(captureCount + 1));

              if (isLearningMode && polishResult.polished) {
                toast({
                  title: "\u2728 Text polished",
                  description: `"${polishResult.text.slice(0, 60)}${polishResult.text.length > 60 ? '...' : ''}"`,
                  variant: "default",
                  duration: 5000,
                });
              }
            }
          } catch (polishError) {
            // Polish failed — use raw STT text. Never block the pipeline.
            logger.warn("BarkFlow Ollama polish failed", { error: polishError }, "barkflow");
          }

          setTranscript(textToPaste);

          // BarkFlow: Consume the active hotkey slot to determine routing
          let activeHotkey = "Fn";
          try {
            const slot = await window.electronAPI?.barkflowConsumeActiveHotkey?.();
            if (slot) {
              activeHotkey = slot;
            }
          } catch (hotkeyErr) {
            logger.warn("BarkFlow: Could not read active hotkey", { error: hotkeyErr }, "barkflow");
          }

          let routedTo = "paste-at-cursor";

          if (activeHotkey === "Fn+N") {
            // Fn+N: Save as markdown file
            routedTo = "save-as-markdown";
            try {
              const mdResult = await window.electronAPI?.barkflowSaveMarkdown?.(textToPaste);
              if (mdResult?.success) {
                logger.info("BarkFlow: Saved markdown note", { filePath: mdResult.filePath }, "barkflow");
                toast({
                  title: "Saved as note",
                  description: mdResult.filePath?.split("/").pop() || "Markdown file saved",
                  variant: "default",
                  duration: 4000,
                });
              } else {
                logger.warn("BarkFlow: Markdown save failed", { error: mdResult?.error }, "barkflow");
                toast({
                  title: "Note save failed",
                  description: mdResult?.error || "Unknown error",
                  variant: "destructive",
                  duration: 5000,
                });
              }
            } catch (mdErr) {
              logger.warn("BarkFlow: Markdown route error", { error: mdErr }, "barkflow");
            }
          } else if (activeHotkey === "Fn+T") {
            // Fn+T: Todo — save entry with routedTo="todo" (Phase 2: Todoist plugin)
            routedTo = "todo";
            toast({
              title: "Saved as todo",
              description: `"${textToPaste.slice(0, 50)}${textToPaste.length > 50 ? "..." : ""}"`,
              variant: "default",
              duration: 4000,
            });
          } else if (activeHotkey === "Fn+P") {
            // Fn+P: Project — save entry with routedTo="project" (show picker later)
            routedTo = "project";
            toast({
              title: "Saved to project",
              description: `"${textToPaste.slice(0, 50)}${textToPaste.length > 50 ? "..." : ""}"`,
              variant: "default",
              duration: 4000,
            });
          } else {
            // Default: Fn alone — paste at cursor (original behavior)
            const isStreaming = result.source?.includes("streaming");
            const { keepTranscriptionInClipboard } = getSettings();
            const pasteStart = performance.now();
            await audioManagerRef.current.safePaste(textToPaste, {
              ...(isStreaming ? { fromStreaming: true } : {}),
              restoreClipboard: !keepTranscriptionInClipboard,
            });
            logger.info(
              "Paste timing",
              {
                pasteMs: Math.round(performance.now() - pasteStart),
                source: result.source,
                textLength: result.text.length,
              },
              "streaming"
            );
          }

          audioManagerRef.current.saveTranscription(textToPaste, rawText);

          // BarkFlow: Save to bf_entries for unified history
          window.electronAPI?.barkflowSaveEntry?.({
            source: 'voice',
            rawText: rawText,
            polished: textToPaste !== rawText ? textToPaste : null,
            routedTo,
            hotkeyUsed: activeHotkey,
            durationMs: null, // TODO: get from audio recording
            projectId: null,
            audioPath: null,
            metadata: {},
          });

          if (result.source === "openai" && getSettings().useLocalWhisper) {
            toast({
              title: t("hooks.audioRecording.fallback.title"),
              description: t("hooks.audioRecording.fallback.description"),
              variant: "default",
            });
          }

          // Cloud usage: limit reached after this transcription
          if (result.source === "openwhispr" && result.limitReached) {
            // Notify control panel to show UpgradePrompt dialog
            window.electronAPI?.notifyLimitReached?.({
              wordsUsed: result.wordsUsed,
              limit:
                result.wordsRemaining !== undefined
                  ? result.wordsUsed + result.wordsRemaining
                  : 2000,
            });
          }

          if (audioManagerRef.current.shouldUseStreaming()) {
            audioManagerRef.current.warmupStreamingConnection();
          }
        }
      },
    });

    audioManagerRef.current.setContext("dictation");
    window.electronAPI.getSttConfig?.().then((config) => {
      if (config?.success && audioManagerRef.current) {
        audioManagerRef.current.setSttConfig(config);
        if (audioManagerRef.current.shouldUseStreaming()) {
          audioManagerRef.current.warmupStreamingConnection();
        }
      }
    });

    const handleToggle = async () => {
      if (!audioManagerRef.current) return;
      const currentState = audioManagerRef.current.getState();

      if (!currentState.isRecording && !currentState.isProcessing) {
        await performStartRecording();
      } else if (currentState.isRecording) {
        await performStopRecording();
      }
    };

    const handleStart = async () => {
      await performStartRecording();
    };

    const handleStop = async () => {
      await performStopRecording();
    };

    const disposeToggle = window.electronAPI.onToggleDictation(() => {
      handleToggle();
      onToggle?.();
    });

    const disposeStart = window.electronAPI.onStartDictation?.(() => {
      handleStart();
      onToggle?.();
    });

    const disposeStop = window.electronAPI.onStopDictation?.(() => {
      handleStop();
      onToggle?.();
    });

    const handleNoAudioDetected = () => {
      toast({
        title: t("hooks.audioRecording.noAudio.title"),
        description: t("hooks.audioRecording.noAudio.description"),
        variant: "default",
      });
    };

    const disposeNoAudio = window.electronAPI.onNoAudioDetected?.(handleNoAudioDetected);

    // Cleanup
    return () => {
      disposeToggle?.();
      disposeStart?.();
      disposeStop?.();
      disposeNoAudio?.();
      if (audioManagerRef.current) {
        audioManagerRef.current.cleanup();
      }
    };
  }, [toast, onToggle, performStartRecording, performStopRecording, t]);

  const cancelRecording = async () => {
    if (audioManagerRef.current) {
      const state = audioManagerRef.current.getState();
      if (getSettings().pauseMediaOnDictation) {
        window.electronAPI?.resumeMediaPlayback?.();
      }
      if (state.isStreaming) {
        return await audioManagerRef.current.stopStreamingRecording();
      }
      return audioManagerRef.current.cancelRecording();
    }
    return false;
  };

  const cancelProcessing = () => {
    if (audioManagerRef.current) {
      return audioManagerRef.current.cancelProcessing();
    }
    return false;
  };

  const toggleListening = async () => {
    if (!isRecording && !isProcessing) {
      await performStartRecording();
    } else if (isRecording) {
      await performStopRecording();
    }
  };

  return {
    isRecording,
    isProcessing,
    isStreaming,
    transcript,
    partialTranscript,
    startRecording: performStartRecording,
    stopRecording: performStopRecording,
    cancelRecording,
    cancelProcessing,
    toggleListening,
  };
};
