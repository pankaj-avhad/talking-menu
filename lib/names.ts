// Matching a spoken name to a stored customer. The caller's name is the only
// login, so matching ignores case and accents and tolerates small slips.
// Anything short of an exact match is confirmed with the caller first.

import { editDistance, normalizeText } from "@/lib/text"

/** Lookup key: lower case, no accents or punctuation. */
export function nameKey(name: string) {
  return normalizeText(name)
}

/**
 * A rough sound-alike key: keep the first letter, drop vowels and silent
 * letters, merge repeats. "Pankaj" and "Pun Cudge" both give "pnkj".
 */
export function soundKey(name: string) {
  const s = nameKey(name)
    .replace(/ /g, "")
    .replace(/dge/g, "j")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
  const rest = s.slice(1).replace(/[aeiouyhw]/g, "")
  return (s.slice(0, 1) + rest).replace(/(.)\1+/g, "$1")
}

export type NameMatch<T> = { kind: "exact" | "close"; customer: T }

/**
 * Finds the customer a spoken name refers to. `customers` should be sorted
 * most recent first, so a tie goes to the latest caller.
 */
export function matchName<T extends { name: string; nameKey: string }>(
  spoken: string,
  customers: T[]
): NameMatch<T> | null {
  const key = nameKey(spoken)
  if (!key) return null

  const exact = customers.find((c) => c.nameKey === key)
  if (exact) return { kind: "exact", customer: exact }

  const sound = soundKey(spoken)
  const [firstWord] = key.split(" ")
  const allowedEdits = key.length >= 8 ? 2 : key.length >= 4 ? 1 : 0

  let best: { customer: T; score: number } | null = null
  for (const customer of customers) {
    let score = Infinity
    const distance = editDistance(key, customer.nameKey)
    if (distance <= allowedEdits) {
      score = distance
    } else if (sound.length >= 3 && soundKey(customer.name) === sound) {
      score = allowedEdits + 0.5
    } else if (
      firstWord.length >= 3 &&
      customer.nameKey.split(" ")[0] === firstWord &&
      key.includes(" ") !== customer.nameKey.includes(" ")
    ) {
      // "Pankaj" against "Pankaj Avhad", or the other way round.
      score = allowedEdits + 1
    }
    if (score < (best?.score ?? Infinity)) best = { customer, score }
  }
  return best ? { kind: "close", customer: best.customer } : null
}

// Words that follow a name without being part of it ("it's Priya again").
const AFTER_NAME = new Set(
  "again here calling speaking please thanks thank and from with".split(" ")
)
// Short replies that are not names.
const NOT_NAMES = new Set(
  "yes yeah yep no nope hi hello hey okay ok sure thanks thank you bye goodbye".split(" ")
)

/**
 * The name in a caller's reply to "May I know your name?", as the speech
 * transcript has it: "Hi, this is Priya." -> "Priya". Null if there's no
 * clear name.
 */
export function nameFromSpeech(text: string): string | null {
  const words = text
    .replace(/[^\p{L}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
  const lower = words.map((w) => w.toLowerCase())

  const intro = [
    ["my", "name", "is"],
    ["my", "name's"],
    ["name", "is"],
    ["this", "is"],
    ["it's"],
    ["it", "is"],
    ["i'm"],
    ["i", "am"],
    ["call", "me"],
  ]
  let start = -1
  for (let i = 0; i < lower.length && start < 0; i++) {
    for (const phrase of intro) {
      if (phrase.every((w, j) => lower[i + j] === w)) {
        start = i + phrase.length
        break
      }
    }
  }
  if (start < 0) {
    // A bare answer: "Priya." or "Priya Sharma."
    if (words.length === 0 || words.length > 2) return null
    start = 0
  }

  const name: string[] = []
  for (let i = start; i < words.length && name.length < 2; i++) {
    if (AFTER_NAME.has(lower[i]) || NOT_NAMES.has(lower[i])) break
    name.push(words[i])
  }
  return name.length > 0 ? name.join(" ") : null
}

/**
 * Whether two spellings are the same name: equal first names, a slip
 * apart, or sound-alikes ("Pankaj" and "Pun Cudge").
 */
export function sameName(a: string, b: string) {
  const keyA = nameKey(a)
  const keyB = nameKey(b)
  if (!keyA || !keyB) return false
  const [firstA] = keyA.split(" ")
  const [firstB] = keyB.split(" ")
  return (
    firstA === firstB ||
    (Math.min(firstA.length, firstB.length) >= 4 && editDistance(firstA, firstB) <= 1) ||
    soundKey(keyA) === soundKey(keyB) ||
    soundKey(firstA) === soundKey(firstB)
  )
}
