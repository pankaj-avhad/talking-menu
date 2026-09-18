// Text matching shared by menu search and customer-name lookup. Speech comes
// in with any casing, accents and punctuation, so both sides are normalised
// before comparing.

/** "Bún Chả  Hà-Nội!" -> "bun cha ha noi" */
export function normalizeText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Edit distance where swapping two neighbouring letters counts as one edit
 * (optimal string alignment), so "pankja" is one edit from "pankaj".
 */
export function editDistance(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prevPrev: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, prevPrev[j - 2] + 1)
      }
      row.push(value)
    }
    prevPrev = prev
    prev = row
  }
  return prev[b.length]
}
