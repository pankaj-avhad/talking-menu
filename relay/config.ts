// Relay settings, all from the environment (.env locally).

function required(name: string) {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set. Add it to .env.`)
    process.exit(1)
  }
  return value
}

function number(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value)) {
    console.error(`${name} must be a number.`)
    process.exit(1)
  }
  return value
}

export const config = {
  port: number("RELAY_PORT", 8787),
  bosonApiKey: required("BOSON_API_KEY"),
  bosonUrl: "wss://api.boson.ai/v1/realtime?model=higgs-realtime",
  /** A Boson preset: chloe, eleanor, nora, jake, marcus, oliver, or default. */
  voice: process.env.AGENT_VOICE || "chloe",
  /**
   * server_vad waits for half a second of silence. semantic_vad ends a turn
   * after 100 ms when the words sound finished, which in testing split
   * callers' sentences in two ("No." / "that's all for now").
   */
  turnDetection:
    process.env.AGENT_TURN_DETECTION === "semantic_vad"
      ? ("semantic_vad" as const)
      : ("server_vad" as const),
  /**
   * With server_vad, how long a pause ends the caller's turn (Boson's
   * default is 500 ms). Raise it if callers get cut off mid-sentence; each
   * reply then starts that much later.
   */
  silenceMs: number("AGENT_SILENCE_MS", 500),
  /**
   * Where order links point (the Next.js app). Unset, a browser call links
   * to the site the call page was opened on.
   */
  appUrl: process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || null,
  /**
   * Sites allowed to open browser calls, comma-separated. Unset, any page
   * on this machine (http://localhost or 127.0.0.1, any port) may.
   */
  allowedOrigins: (process.env.RELAY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
  /** The restaurant's own line; handed-off calls ring here (phone calls only). */
  staffPhone: process.env.STAFF_PHONE_NUMBER || null,
  deliveryFeeCents: number("DELIVERY_FEE_CENTS", 0),
  /** Browser calls at once; each one is a paid Boson session. */
  maxBrowserCalls: number("MAX_BROWSER_CALLS", 2),
  /** Hard stop for any call, in minutes. */
  maxCallMinutes: number("MAX_CALL_MINUTES", 15),
}

export type RelayConfig = typeof config
