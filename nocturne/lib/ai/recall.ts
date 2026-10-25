import type { Message } from "@/lib/data/types";
import { estimateTokens } from "./context";

// Common words that say nothing about what a message is about (English + Spanish).
const STOPWORDS = new Set(
  (
    "the and for are but not you your yours with this that these those have has had was were will would could should " +
    "what when where which who whom why how all any can did does doing done from into just like more most much " +
    "now only our out over own same she her hers him his its they them their then than there here too very about " +
    "again also been being because before after while some such each few other off once both until upon onto " +
    "yes yeah okay really still even ever let lets get got make made say said tell told know think want need " +
    "remember remembers remembered recall something thing things time way well back going come came look " +
    "que los las una uno unos unas por para con sin como pero mas muy esta este estos estas eso esa ese del " +
    "tus sus mis nos les ella ellos ellas soy eres somos son fue era hay tengo tienes tiene cuando donde quien " +
    "porque algo todo toda todos todas otra otro bien aqui alli ahora tambien recuerdas recuerda acuerdas"
  ).split(" "),
);

function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Content words with a light plural strip, so "dresses" matches "dress". */
export function keywords(text: string): string[] {
  const words = normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (const w of words) {
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return [...out];
}

function stem(w: string) {
  if (w.length > 5 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * Finds the earlier messages most relevant to `query` (typically the user's latest
 * message) and returns them in chronological order, within `maxTokens`. Each hit
 * brings the message right after it along (usually the character's answer).
 */
export function recall(older: Message[], query: string, maxTokens: number): Message[] {
  const terms = keywords(query);
  if (!terms.length || !older.length) return [];

  const docs = older.map((m) => new Set(keywords(m.content)));
  // Rarer words count more (inverse document frequency).
  const idf = new Map(
    terms.map((t) => {
      const df = docs.reduce((n, d) => n + (d.has(t) ? 1 : 0), 0);
      return [t, df === 0 ? 0 : Math.log(1 + older.length / df)];
    }),
  );

  const scored = older
    .map((m, i) => ({ i, score: terms.reduce((s, t) => s + (docs[i].has(t) ? idf.get(t)! : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.i - a.i);

  const picked = new Set<number>();
  let used = 0;
  const take = (i: number) => {
    if (i < 0 || i >= older.length || picked.has(i)) return true;
    const cost = estimateTokens(older[i].content);
    if (used + cost > maxTokens) return false;
    picked.add(i);
    used += cost;
    return true;
  };
  for (const { i } of scored) {
    if (!take(i)) continue;
    take(i + 1);
  }
  return [...picked].sort((a, b) => a - b).map((i) => older[i]);
}

export function formatRecalled(messages: Message[], userName: string, characterName: string): string {
  return messages.map((m) => `${m.role === "user" ? userName : characterName}: ${m.content}`).join("\n\n");
}
