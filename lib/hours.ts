// Opening-hours helpers for menu.json's `hours` blocks. Pure functions, safe to
// use in client components.

import type { Weekday, WeeklyHours } from "@/lib/menu"

export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

const SHORT_DAY: Record<Weekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
}

/** "11 AM - 2:15 PM" -> "11 AM – 2:15 PM" */
export function formatRange(range: string) {
  return range.replace(/\s*-\s*/, " – ")
}

/** Collapses runs of days with identical hours, e.g. Mon – Fri 11 AM – 2:15 PM. No ranges means closed. */
export function groupWeeklyHours(hours: WeeklyHours) {
  const groups: { days: string; ranges: string[] }[] = []
  let start = 0
  for (let i = 1; i <= WEEKDAYS.length; i++) {
    const current = hours[WEEKDAYS[start]]
    if (i < WEEKDAYS.length && hours[WEEKDAYS[i]].join() === current.join()) {
      continue
    }
    const first = SHORT_DAY[WEEKDAYS[start]]
    const last = SHORT_DAY[WEEKDAYS[i - 1]]
    groups.push({
      days: start === i - 1 ? first : `${first} – ${last}`,
      ranges: current.map(formatRange),
    })
    start = i
  }
  return groups
}

export type OpenStatus = { open: boolean; detail: string | null }

type Range = {
  open: number
  close: number
  openText: string
  closeText: string
}

/**
 * Whether the restaurant is open at `now` in its own time zone, and when that
 * changes ("until 2:15 PM", "opens Mon 11 AM"). null if the hours or the time
 * zone can't be read, so callers show nothing rather than a wrong answer.
 */
export function getOpenStatus(
  hours: WeeklyHours,
  timeZone: string,
  now: Date
): OpenStatus | null {
  const clock = localClock(now, timeZone)
  const week = WEEKDAYS.map((day) => hours[day].map(parseRange))
  if (!clock || week.some((ranges) => ranges.includes(null))) return null
  const ranges = week as Range[][]
  const { day, minutes } = clock

  const yesterday = (day + 6) % 7
  const openNow =
    ranges[day].find((r) =>
      r.close > r.open
        ? r.open <= minutes && minutes < r.close
        : minutes >= r.open
    ) ??
    // Late-night hours that started yesterday, e.g. "6 PM - 2 AM".
    ranges[yesterday].find((r) => r.close <= r.open && minutes < r.close)
  if (openNow) return { open: true, detail: `until ${openNow.closeText}` }

  for (let offset = 0; offset < 7; offset++) {
    const next = ranges[(day + offset) % 7]
      .filter((r) => offset > 0 || r.open > minutes)
      .sort((a, b) => a.open - b.open)[0]
    if (next) {
      const when =
        offset === 0
          ? ""
          : offset === 1
            ? "tomorrow "
            : `${SHORT_DAY[WEEKDAYS[(day + offset) % 7]]} `
      return { open: false, detail: `opens ${when}${next.openText}` }
    }
  }
  return { open: false, detail: null }
}

/** Weekday index (0 = Monday) and minutes after midnight at `now` in `timeZone`. */
function localClock(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(now)
  } catch {
    return null
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  const day = WEEKDAYS.indexOf(part("weekday").toLowerCase() as Weekday)
  const minutes = (Number(part("hour")) % 24) * 60 + Number(part("minute"))
  return day < 0 || Number.isNaN(minutes) ? null : { day, minutes }
}

function parseRange(range: string): Range | null {
  const [openText = "", closeText = ""] = range.split(/\s*-\s*/)
  const open = parseTime(openText)
  const close = parseTime(closeText)
  if (open === null || close === null) return null
  return { open, close, openText: openText.trim(), closeText: closeText.trim() }
}

/** "11 AM" or "2:15 PM" -> minutes after midnight. */
function parseTime(text: string) {
  const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])M$/i)
  if (!match) return null
  const hour =
    (Number(match[1]) % 12) + (match[3].toUpperCase() === "P" ? 12 : 0)
  return hour * 60 + Number(match[2] ?? 0)
}
