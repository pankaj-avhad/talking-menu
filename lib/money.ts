// Money helpers. Amounts are integer cents, like price.amount_cents in
// menu.json, so totals never pick up floating-point errors.

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

/** 1575 -> "$15.75" */
export function formatUsd(cents: number) {
  return usd.format(cents / 100)
}

/**
 * 1575 -> "fifteen dollars and seventy-five cents". Totals are handed to the
 * voice agent already in words, so it reads them out instead of doing maths.
 */
export function spokenUsd(cents: number) {
  const dollars = Math.floor(cents / 100)
  const rest = cents % 100
  const parts: string[] = []
  if (dollars > 0 || rest === 0) {
    parts.push(`${numberToWords(dollars)} ${dollars === 1 ? "dollar" : "dollars"}`)
  }
  if (rest > 0) {
    parts.push(`${numberToWords(rest)} ${rest === 1 ? "cent" : "cents"}`)
  }
  return parts.join(" and ")
}

/**
 * Whether `text` says the amount, in any of the ways people say money:
 * "$53.30", "53.30", "fifty-three thirty", "fifty-three dollars and thirty
 * cents", "twelve oh five".
 */
export function mentionsAmount(text: string, cents: number) {
  const said = text.toLowerCase().replace(/-/g, " ").replace(/,/g, "")
  const dollars = Math.floor(cents / 100)
  const rest = cents % 100
  const d = numberToWords(dollars).replace(/-/g, " ")
  const c = numberToWords(rest).replace(/-/g, " ")
  const forms = [
    formatUsd(cents).toLowerCase().replace(/,/g, ""),
    `${dollars}.${String(rest).padStart(2, "0")}`,
    spokenUsd(cents).replace(/-/g, " "),
    rest === 0 ? `${d} dollars` : rest < 10 ? `${d} oh ${c}` : `${d} ${c}`,
  ]
  return forms.some((form) => said.includes(form))
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
]
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
]

/** Whole numbers from 0 to 999,999, e.g. 342 -> "three hundred forty-two". */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n)
  if (n < 20) return ONES[n]
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "")
  }
  if (n < 1000) {
    const rest = n % 100
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberToWords(rest)}` : ""}`
  }
  const rest = n % 1000
  return `${numberToWords(Math.floor(n / 1000))} thousand${rest ? ` ${numberToWords(rest)}` : ""}`
}
