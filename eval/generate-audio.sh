#!/bin/bash
# Generate test audio files from eval-config.json using macOS text-to-speech
# Usage: ./eval/generate-audio.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIO_DIR="$SCRIPT_DIR/audio"
CONFIG="$SCRIPT_DIR/eval-config.json"

mkdir -p "$AUDIO_DIR"

echo "Generating test audio from eval-config.json..."
echo "Using macOS 'say' command with Samantha voice"
echo ""

# Extract spoken text and audio filenames from config
node -e "
const config = require('$CONFIG');
for (const c of config.cases) {
  console.log(JSON.stringify({ id: c.id, spoken: c.spoken, file: c.audioFile }));
}
" | while read -r line; do
  id=$(echo "$line" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).id)")
  spoken=$(echo "$line" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).spoken)")
  file=$(echo "$line" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).file)")

  outpath="$AUDIO_DIR/$file"

  if [ -f "$outpath" ]; then
    echo "  skip: $file (already exists)"
    continue
  fi

  echo "  generating: $file"
  # Use AIFF first (say's native format), then convert
  say -v Samantha -o "$outpath.aiff" "$spoken" 2>/dev/null

  # Convert to WAV (16kHz mono — what Whisper expects)
  if command -v ffmpeg &>/dev/null; then
    ffmpeg -i "$outpath.aiff" -ar 16000 -ac 1 -y "$outpath" 2>/dev/null
    rm -f "$outpath.aiff"
  else
    # No ffmpeg — rename AIFF to WAV (Whisper can handle it)
    mv "$outpath.aiff" "$outpath"
  fi
done

echo ""
echo "Done! Audio files in: $AUDIO_DIR"
ls -la "$AUDIO_DIR"/*.wav 2>/dev/null | wc -l | xargs -I{} echo "{} audio files generated"
