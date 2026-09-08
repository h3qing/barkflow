/**
 * Deterministic guard on LLM cleanup output — the last line of defense
 * against a polish model pasting its own deliberation, a translation, or a
 * roleplay reply into the user's text.
 *
 * Observed in the wild (Qwen3.5 2B): raw "…如果架构合适的话…" came back as the
 * cleaned sentence PLUS 300 characters of the model discussing whether 架构
 * was a typo ("注：原文中"架构"为误写… 修正后：…"). `<think>` stripping and
 * `enable_thinking: false` already exist upstream of this — but inline
 * meta-commentary is plain text and no tag strip can catch it.
 *
 * Independent, deterministic checks, all judged AGAINST THE RAW INPUT so
 * legitimately dictated words can never trip them:
 *
 *  1. Growth: cleanup removes fillers and fixes punctuation — it never
 *     multiplies the text. Output longer than GROWTH_RATIO x input (plus a
 *     fixed slack for punctuation/number expansion) is not a cleanup.
 *  2. Emote: a reply that is just "*punch*" is the model roleplaying, unless
 *     the user dictated the asterisks (literally or as 星号/asterisk).
 *  3. Language flip: a mostly-Chinese input can never come back with almost
 *     no Han characters (or the reverse) — that is a translation, also
 *     observed in production ("Pizzo,你知不知道…" -> pure English). The same
 *     check catches PARTIAL translation three ways: losing a chunk of one
 *     script while gaining the other in proportion; new English words that
 *     appear while Chinese content vanished (延迟 -> "latency"); an English
 *     content word that vanished while new Han characters appeared
 *     (deploy -> 部署); and a bilingual "(translation)" appended to intact
 *     Chinese.
 *  4. Meta markers: a short, high-precision list of phrases a cleanup model
 *     uses to talk ABOUT the text (注：, 修正后：, "Here is the cleaned"…).
 *     Only counted when the RAW text does not itself contain the marker.
 *
 * On rejection the caller pastes the raw transcript: what the user actually
 * said always beats what a model wanted to say about it.
 */

const GROWTH_RATIO = 2.0;
const GROWTH_SLACK_CHARS = 60;

// High-precision only: each of these is a phrase used to discuss a text, not
// to write one. Anything ambiguous stays off this list — the growth check
// catches verbose leaks anyway.
const META_MARKERS = [
  // zh deliberation
  "注：",
  "注意：",
  "修正后：",
  "修正为",
  "原文中",
  "清理后的文本",
  "以下是清理",
  "处理后的文本",
  // answering instead of cleaning (observed: a dictated question came back
  // as the question plus "**回答：** 1. …" — a full markdown answer)
  "回答：",
  "回答:",
  "答：",
  "answer:",
  // en deliberation
  "here is the cleaned",
  "here's the cleaned",
  "cleaned-up version",
  "cleaned up version",
  "corrected version:",
  "i corrected",
  "i have corrected",
  "the original text",
  "note:",
];

export type LanguageFlipDetail = "whole" | "ratio" | "new-latin" | "lost-latin" | "append";

export interface PolishGuardResult {
  accepted: boolean;
  /** The text to use: polished when accepted, raw when rejected. */
  text: string;
  reason?: "growth" | "meta-marker" | "language-flip" | "emote";
  marker?: string;
  /** Which language-flip rule fired — for logs and tuning. */
  detail?: LanguageFlipDetail;
}

const HAN_RE = /[一-鿿㐀-䶿]/g;
const LATIN_RE = /[a-zA-Z]/g;
// Spoken punctuation words are meta, not content: "星号 punch 星号" legitimately
// becomes *punch*, which would otherwise read as a Han-ratio collapse.
const SPOKEN_PUNCT_RE = /句号|逗号|问号|感叹号|冒号|分号|顿号|换行|新段落|另起一段|星号|引号|括号/g;
// Chinese fillers a cleanup is SUPPOSED to delete. They do not count as lost
// content, so filler-heavy speech cannot make an English STT fix look like a
// translation.
const ZH_FILLER_RE = /嗯|啊|呃|哦|额|唔|哎|诶|哈|嘛|啦|呀|那个|这个|就是|然后|反正|对吧|是吧/g;
// A reply that is just "*punch*" — an LLM roleplay emote, not a cleanup.
const EMOTE_RE = /^\s*\*[^*\n]{1,40}\*\s*$/;

// English words a cleanup legitimately adds or removes without translating
// anything: fillers, spoken punctuation, function words, number words,
// contraction expansions, loanwords ("OK").
const EN_STOP = new Set(
  (
    "um uh er erm umm uhh hmm mm like you know basically literally actually so well okay ok yeah yes no " +
    "the a an to and of or in on at for with by from as i im ill ive id its is are was were be been being " +
    "this that these those it we he she they them my me our your his her their us will would can could should " +
    "do does did done have has had not dont cant wont didnt isnt arent " +
    "dot com net org io slash dash hyphen underscore at period comma colon semicolon question mark exclamation point " +
    "new line paragraph asterisk quote bracket am pm oclock " +
    "gonna gotta wanna going want got get let lets wait scratch meant mean " +
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
    "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million " +
    "half quarter dollars dollar cents percent first second third"
  ).split(/\s+/)
);

function letterCounts(text: string): { han: number; latin: number } {
  const content = text.replace(SPOKEN_PUNCT_RE, "");
  return {
    han: (content.match(HAN_RE) || []).length,
    latin: (content.match(LATIN_RE) || []).length,
  };
}

function contentHanCount(text: string): number {
  return (text.replace(SPOKEN_PUNCT_RE, "").replace(ZH_FILLER_RE, "").match(HAN_RE) || []).length;
}

function contentLatinLetters(words: string[]): number {
  return words.filter((w) => !EN_STOP.has(w)).reduce((sum, w) => sum + w.length, 0);
}

function latinWords(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[’']/g, "")
      .match(/[a-z]+/g) || []
  );
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Is `word` the same word as one in `pool`, allowing an STT/spelling fix? */
function nearAny(word: string, pool: Set<string>): boolean {
  if (pool.has(word)) return true;
  for (const other of pool) {
    if (word.length >= 4 && Math.abs(word.length - other.length) <= 1 && levenshtein(word, other) <= 1) {
      return true;
    }
    if (
      Math.min(word.length, other.length) >= 3 &&
      Math.abs(word.length - other.length) <= 2 &&
      (word.startsWith(other) || other.startsWith(word))
    ) {
      return true;
    }
  }
  return false;
}

/** Han characters in `polished` beyond what `raw` already had (multiset). */
function newHanChars(raw: string, polished: string): number {
  const counts = new Map<string, number>();
  for (const ch of raw.match(HAN_RE) || []) counts.set(ch, (counts.get(ch) || 0) + 1);
  let fresh = 0;
  for (const ch of polished.match(HAN_RE) || []) {
    const left = counts.get(ch) || 0;
    if (left > 0) counts.set(ch, left - 1);
    else fresh++;
  }
  return fresh;
}

/**
 * Translation detector. Whole-sentence flips collapse the script ratio;
 * partial flips are caught by proportion (lose one script, gain the other)
 * and by token novelty (English words that were never spoken appearing as
 * Chinese content disappears, or the reverse). Ratios are over language
 * letters only, so punctuation and digit conversion ("三百块" -> "300元")
 * cannot skew them.
 */
function languageFlip(raw: string, polished: string): LanguageFlipDetail | null {
  const r = letterCounts(raw);
  const p = letterCounts(polished);
  const rTotal = r.han + r.latin;
  const pTotal = p.han + p.latin;
  if (rTotal < 2 || pTotal < 2) return null; // too little signal to judge

  const rHanRatio = r.han / rTotal;
  const pHanRatio = p.han / pTotal;

  // Whole flip, zh -> en: substantial Chinese in, almost none out.
  if (rHanRatio >= 0.3 && pHanRatio <= rHanRatio * 0.25) return "whole";
  // Whole flip, en -> zh: substantial Latin in, almost none out.
  const rLatinRatio = 1 - rHanRatio;
  const pLatinRatio = 1 - pHanRatio;
  if (rLatinRatio >= 0.5 && pLatinRatio <= rLatinRatio * 0.25) return "whole";

  // Everything below counts CONTENT only: Chinese fillers and English
  // stop/filler/number words are exactly what a cleanup adds and removes
  // ("gonna" -> "are going to", 嗯/那个 gone, "五点半" -> "5:30 PM"), so they
  // must not read as one language shrinking or the other growing.
  const rawWordList = latinWords(raw);
  const polishedWordList = latinWords(polished);
  const rc = { han: contentHanCount(raw), latin: contentLatinLetters(rawWordList) };
  const pc = { han: contentHanCount(polished), latin: contentLatinLetters(polishedWordList) };

  // Partial translation by proportion: cleanup can legitimately DROP content
  // of either script (self-corrections, dedup) — but it has no reason to
  // drop one script AND grow the other at the same time. Translating N Han
  // characters yields roughly 2-3N Latin letters, so the growth must be in
  // proportion to the loss.
  const hanLost = rc.han - pc.han;
  const latinGained = pc.latin - rc.latin;
  if (hanLost >= Math.max(2, rc.han * 0.3) && latinGained >= Math.max(4, hanLost * 1.2)) {
    return "ratio";
  }
  const latinLost = rc.latin - pc.latin;
  const hanGained = pc.han - rc.han;
  if (latinLost >= Math.max(6, rc.latin * 0.3) && hanGained >= Math.max(3, latinLost * 0.4)) {
    return "ratio";
  }

  // Partial translation by token novelty. A cleanup keeps the speaker's
  // words: English words in the output that were never spoken (allowing a
  // one-letter STT fix) are new content, and new content in English while
  // Chinese content disappeared is a translated clause.
  const rawWords = new Set(rawWordList);
  const newLatinLetters = polishedWordList
    .filter((w) => !EN_STOP.has(w) && !nearAny(w, rawWords))
    .reduce((sum, w) => sum + w.length, 0);
  if (hanLost >= 2 && newLatinLetters >= 6) return "new-latin";

  // The reverse: a spoken English content word gone, Chinese characters
  // that were never spoken in its place (deploy -> 部署).
  const polishedWords = new Set(polishedWordList);
  const lostLatinLetters = [...rawWords]
    .filter((w) => w.length >= 4 && !EN_STOP.has(w) && !nearAny(w, polishedWords))
    .reduce((sum, w) => sum + w.length, 0);
  if (lostLatinLetters >= 5 && newHanChars(raw, polished) >= 2) return "lost-latin";

  // Bilingual append: the Chinese is intact and a whole English rendering
  // was added next to it. Threshold high enough that an STT fix producing
  // one long new word ("cube or netties" -> "Kubernetes", 10) passes.
  if (r.han >= 4 && hanLost <= 0 && newLatinLetters >= 12) return "append";

  return null;
}

export function guardPolishedOutput(raw: string, polished: string): PolishGuardResult {
  const rawText = typeof raw === "string" ? raw : "";
  const polishedText = typeof polished === "string" ? polished : "";

  if (!polishedText.trim()) {
    // Empty polish is handled by callers' existing `text || rawText` fallbacks.
    return { accepted: true, text: polishedText };
  }

  if (polishedText.length > rawText.length * GROWTH_RATIO + GROWTH_SLACK_CHARS) {
    return { accepted: false, text: rawText, reason: "growth" };
  }

  // "*punch*" out of thin air is an LLM roleplay emote — unless the user
  // dictated the asterisks themselves (literally, or as spoken punctuation:
  // "星号 punch 星号" / "asterisk punch asterisk" legitimately becomes *punch*).
  // Checked before the language rule: an emote is also a translation, and
  // the more specific reason is the useful one in the logs.
  const dictatedAsterisk = rawText.includes("*") || /星号|asterisk/i.test(rawText);
  if (EMOTE_RE.test(polishedText) && !dictatedAsterisk) {
    return { accepted: false, text: rawText, reason: "emote" };
  }

  const flip = languageFlip(rawText, polishedText);
  if (flip) {
    return { accepted: false, text: rawText, reason: "language-flip", detail: flip };
  }

  // Markdown bold/headers out of nowhere: a cleanup never emphasises, an
  // answer does ("**1. 这些币的特征**"). Dictated markup (raw has '*' or
  // says 加粗/bold) is exempt.
  const dictatedMarkup = rawText.includes("*") || /加粗|粗体|bold/i.test(rawText);
  if (!dictatedMarkup && /\*\*[^*\n]{1,80}\*\*/.test(polishedText)) {
    return { accepted: false, text: rawText, reason: "meta-marker", marker: "**" };
  }

  const polishedLower = polishedText.toLowerCase();
  const rawLower = rawText.toLowerCase();
  for (const marker of META_MARKERS) {
    if (polishedLower.includes(marker) && !rawLower.includes(marker)) {
      return { accepted: false, text: rawText, reason: "meta-marker", marker };
    }
  }

  return { accepted: true, text: polishedText };
}
