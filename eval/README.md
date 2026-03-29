# WhisperWoof Eval Set

Test audio samples paired with expected transcription and polish outputs.
Used to measure and improve STT + polish quality.

## Quick Start

```bash
# 1. Record test audio samples
node eval/record-samples.js

# 2. Run eval against current pipeline
node eval/run-eval.js

# 3. View results
cat eval/results/latest.json
```

## Directory Structure

```
eval/
  audio/           — .wav test recordings (you create these)
  expected/        — expected outputs per sample (JSON)
  results/         — eval run results
  record-samples.js — helper to record samples from mic
  run-eval.js      — runs pipeline on all samples, scores results
  eval-config.json — test cases definition
```

## Creating Test Cases

### Option 1: Record from mic
```bash
node eval/record-samples.js
# Speaks each prompt, records 5-second clips
```

### Option 2: Use text-to-speech
```bash
# macOS built-in TTS
say -o eval/audio/sample-01.wav --data-format=LEI16@16000 "um so like I need to first go to the store and then uh second pick up the kids"
```

### Option 3: Use your own recordings
Drop any .wav/.mp3/.m4a files into `eval/audio/` and add matching entries in `eval-config.json`.

## Eval Metrics

- **WER (Word Error Rate)** — edit distance between expected and actual transcription
- **Polish Match** — does the polished output match expected format (lists, punctuation)
- **Latency** — time from audio input to polished output
- **Filler Removal** — were all filler words removed?
