/**
 * Pure decision logic for regenerating a History entry from its stored
 * audio with a different STT model and/or cleanup model.
 *
 * Lives apart from the IPC handlers so it can be tested without Electron.
 * The handlers in ipcHandlers.js own the side effects (reading the audio,
 * invoking an engine, writing the row back); everything that decides
 * *where the audio is*, *what may run*, and *what the row becomes* is here.
 *
 * Data model facts this encodes (verified in the code):
 *   - bf_entries ids are UUIDs; the upstream `transcriptions` table (which
 *     owns the audio files) uses integer ids. New dictations persist the
 *     link as metadata.transcriptionId. Legacy rows are matched by exact
 *     text + timestamp proximity — both tables live in the same SQLite file.
 *   - bf_entries.audio_path is NOT the place for that link: the storage
 *     manager unlinks audio_path on delete. It is only set for imports
 *     (the original file) and clipboard images.
 */

const registry = require("../../models/modelRegistryData.json");
const { getModelKind, getModelRuntime } = require("../../helpers/parakeetModelInfo");
const { PARAKEET_UNSUPPORTED } = require("./retry-transcription-pure");

/** Previous texts kept per entry for Undo. */
const HISTORY_CAP = 10;

/** bf_entries.metadata reaches callers as a JSON string OR an object. */
function parseEntryMetadata(metadata) {
  if (metadata == null) return {};
  if (typeof metadata === "object") return Array.isArray(metadata) ? {} : { ...metadata };
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Where the audio for a bf_entries row can be read from.
 * @returns {{kind:"file", path:string}|{kind:"upstream", id:number}|null}
 */
function resolveAudioSource(row) {
  if (!row) return null;
  const meta = parseEntryMetadata(row.metadata);
  if (meta.type === "image") return null;
  if (row.source === "import" && row.audio_path) return { kind: "file", path: row.audio_path };
  const id = meta.transcriptionId;
  if (Number.isInteger(id) && id > 0) return { kind: "upstream", id };
  return null;
}

function parseUpstreamTimestamp(value) {
  if (!value) return NaN;
  const s = String(value).trim();
  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC with no zone
  // marker; Date.parse would read it as local time.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return Date.parse(`${s.replace(" ", "T")}Z`);
  return Date.parse(s);
}

/**
 * Legacy rows: pick the upstream transcription written for the same
 * dictation. Exact text equality is required; among matches, one that still
 * has audio wins, then the closest timestamp, then the newest id.
 */
function matchUpstreamTranscription(row, candidates, { windowMs = 120000 } = {}) {
  if (!row || !Array.isArray(candidates) || candidates.length === 0) return null;
  const createdAt = Date.parse(row.created_at);
  if (!Number.isFinite(createdAt)) return null;
  const raw = row.raw_text ?? null;
  const shown = row.polished ?? row.raw_text ?? null;

  let best = null;
  for (const c of candidates) {
    if (!c) continue;
    const textMatch = (raw != null && c.raw_text === raw) || (shown != null && c.text === shown);
    if (!textMatch) continue;
    const t = parseUpstreamTimestamp(c.timestamp ?? c.created_at);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - createdAt);
    if (delta > windowMs) continue;
    const cand = { candidate: c, delta, hasAudio: Number(c.has_audio) === 1 };
    if (!best) {
      best = cand;
      continue;
    }
    if (cand.hasAudio !== best.hasAudio) {
      if (cand.hasAudio) best = cand;
      continue;
    }
    if (cand.delta !== best.delta) {
      if (cand.delta < best.delta) best = cand;
      continue;
    }
    if (Number(c.id) > Number(best.candidate.id)) best = cand;
  }
  return best ? best.candidate : null;
}

/**
 * Truthful STT inventory for the picker. `downloaded` comes from the
 * caller's per-kind file check (parakeetServer.isModelDownloaded), never
 * from parakeet.checkModelStatus, which stats a transducer file SenseVoice
 * does not have. `runnable` also needs the binary for the model's runtime.
 */
function buildSttInventory({
  whisper = [],
  parakeet = [],
  whisperAvailable = false,
  parakeetOfflineAvailable = false,
  parakeetOnlineAvailable = false,
} = {}) {
  const items = [];
  for (const w of whisper) {
    if (!w || typeof w.model !== "string") continue;
    const def = registry.whisperModels?.[w.model];
    if (!def) continue;
    const downloaded = Boolean(w.downloaded);
    items.push({
      engine: "whisper",
      model: w.model,
      label: def.name || w.model,
      downloaded,
      runtime: "offline",
      kind: "whisper",
      runnable: downloaded && whisperAvailable,
      languages: null, // any
    });
  }
  for (const p of parakeet) {
    if (!p || typeof p.model !== "string") continue;
    const def = registry.parakeetModels?.[p.model];
    if (!def) continue;
    const runtime = getModelRuntime(p.model);
    const downloaded = Boolean(p.downloaded);
    const binary = runtime === "online" ? parakeetOnlineAvailable : parakeetOfflineAvailable;
    items.push({
      engine: "parakeet",
      model: p.model,
      label: def.name || p.model,
      downloaded,
      runtime,
      kind: getModelKind(p.model),
      runnable: downloaded && binary,
      languages: Array.isArray(def.supportedLanguages) ? def.supportedLanguages : null,
    });
  }
  return items;
}

function baseLanguage(language) {
  if (!language || language === "auto") return null;
  return String(language).toLowerCase().split(/[-_]/)[0];
}

function sherpaItemServes(item, base) {
  if (!base) return true;
  if (Array.isArray(item.languages) && item.languages.length > 0) return item.languages.includes(base);
  return !PARAKEET_UNSUPPORTED.has(base);
}

/**
 * @param {{engine?:string, model?:string}} req
 * @param {{inventory?: Array<Record<string, any>>, language?: string|null}} [ctx]
 * @returns {{ok:true, engine:string, model:string}|{ok:false, code:string, message:string}}
 */
function validateRegenerateRequest(req, { inventory = [], language = null } = {}) {
  const engine = req?.engine;
  const model = req?.model;
  if (engine !== "whisper" && engine !== "parakeet") {
    return { ok: false, code: "ENGINE_UNKNOWN", message: `Unknown engine: ${String(engine)}` };
  }
  if (typeof model !== "string" || !model) {
    return { ok: false, code: "MODEL_UNKNOWN", message: "No model selected" };
  }
  const item = inventory.find((i) => i.engine === engine && i.model === model);
  if (!item) return { ok: false, code: "MODEL_UNKNOWN", message: `Unknown ${engine} model: ${model}` };
  if (!item.downloaded) {
    return { ok: false, code: "MODEL_NOT_DOWNLOADED", message: `${item.label} is not downloaded` };
  }
  if (!item.runnable) {
    const binary = engine === "whisper" ? "whisper-server" : `sherpa-onnx (${item.runtime})`;
    return { ok: false, code: "BINARY_MISSING", message: `${binary} is not installed for ${item.label}` };
  }
  if (engine === "parakeet") {
    const base = baseLanguage(language);
    if (!sherpaItemServes(item, base)) {
      return {
        ok: false,
        code: "LANGUAGE_UNSUPPORTED",
        message: `${item.label} does not transcribe "${base}" — pick Whisper or SenseVoice`,
      };
    }
  }
  return { ok: true, engine, model };
}

/**
 * The row after a regeneration: previous text goes onto metadata.history
 * (newest first, capped) so it can be undone; every existing metadata key
 * (timings, transcriptionId, sourceApp…) survives.
 *
 * @param {Record<string, any>} row bf_entries row (snake_case columns)
 * @param {{rawText?: string|null, polished?: string|null, stt?: Record<string, any>|null, cleanup?: Record<string, any>|null, now: string}} change
 * @returns {{raw_text: string|null, polished: string|null, metadata: Record<string, any>}}
 */
function applyRegeneration(row, { rawText = null, polished = null, stt = null, cleanup = null, now }) {
  const old = parseEntryMetadata(row?.metadata);
  const previous = {
    at: now,
    rawText: row?.raw_text ?? null,
    polished: row?.polished ?? null,
    stt: old.stt ?? null,
    cleanup: old.cleanup ?? null,
  };
  const history = [previous, ...(Array.isArray(old.history) ? old.history : [])].slice(0, HISTORY_CAP);
  const nextRaw = typeof rawText === "string" ? rawText : (row?.raw_text ?? null);
  // Same convention as save-entry: polished is null when nothing changed.
  const nextPolished = typeof polished === "string" && polished !== nextRaw ? polished : null;
  return {
    raw_text: nextRaw,
    polished: nextPolished,
    metadata: {
      ...old,
      stt: stt ?? old.stt ?? null,
      cleanup: cleanup ?? null,
      regeneratedAt: now,
      history,
    },
  };
}

/**
 * Undo: restore the most recent history item. Null when there is none.
 * @param {Record<string, any>} row
 * @returns {{raw_text: string|null, polished: string|null, metadata: Record<string, any>}|null}
 */
function popRegenerationHistory(row) {
  const old = parseEntryMetadata(row?.metadata);
  const history = Array.isArray(old.history) ? old.history : [];
  if (history.length === 0) return null;
  const [previous, ...rest] = history;
  const metadata = { ...old, stt: previous.stt ?? null, cleanup: previous.cleanup ?? null, history: rest };
  if (rest.length === 0) delete metadata.regeneratedAt;
  return {
    raw_text: previous.rawText ?? null,
    polished: previous.polished ?? null,
    metadata,
  };
}

module.exports = {
  HISTORY_CAP,
  parseEntryMetadata,
  resolveAudioSource,
  matchUpstreamTranscription,
  buildSttInventory,
  validateRegenerateRequest,
  applyRegeneration,
  popRegenerationHistory,
};
