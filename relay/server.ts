// The relay: an always-on server that connects each caller to a Boson
// Realtime session and runs the agent's tools. Vercel functions can't hold
// these long-lived WebSockets, so it runs on its own (npm run relay).
//
//   ws://localhost:8787/browser   the call page's "phone line"
//   GET /health                   liveness check
//
// Twilio media streams (phone calls) will join as a second endpoint using
// the same CallSession (PRD milestone 3).

import { createServer } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer, type WebSocket } from "ws"

import type { BrowserToRelay, RelayToBrowser } from "@/lib/call-protocol"
import { newId } from "@/lib/store"
import { CallSession, type CallerLine } from "./call-session"
import { config } from "./config"

const sessions = new Set<CallSession>()

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, calls: sessions.size }))
    return
  }
  res.writeHead(404).end()
})

// Browser audio arrives in ~40 ms chunks; 256 KB is plenty per message.
const browserSockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })

function refuse(socket: Duplex, status: string) {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
}

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://relay")
  if (pathname !== "/browser") return refuse(socket, "404 Not Found")
  // Each call is a paid Boson session, so only our own pages may start one.
  const origin = req.headers.origin ?? ""
  if (!originAllowed(origin)) {
    console.warn(`Refused a browser call from origin ${origin || "(none)"}`)
    return refuse(socket, "403 Forbidden")
  }
  browserSockets.handleUpgrade(req, socket, head, (ws) => acceptBrowserCall(ws, origin))
})

function originAllowed(origin: string) {
  if (config.allowedOrigins.length > 0) return config.allowedOrigins.includes(origin)
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function acceptBrowserCall(ws: WebSocket, origin: string) {
  const send = (message: RelayToBrowser) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }

  if (sessions.size >= config.maxBrowserCalls) {
    send({
      event: "app",
      app: {
        type: "ended",
        reason: "error",
        message: "All our lines are busy right now. Please try again in a minute.",
      },
    })
    ws.close(1013)
    return
  }

  const line: CallerLine = {
    channel: "browser",
    format: { type: "audio/pcm", rate: 24000 },
    sendAudio: (payload) => send({ event: "media", media: { payload } }),
    sendMark: (name) => send({ event: "mark", mark: { name } }),
    clearAudio: () => send({ event: "clear" }),
    emit: (app) => send({ event: "app", app }),
    close: () => ws.close(1000),
  }

  let session: CallSession | null = null
  ws.on("message", (data) => {
    let message: BrowserToRelay
    try {
      message = JSON.parse(String(data))
    } catch {
      return
    }
    switch (message.event) {
      case "start":
        if (session) return
        session = new CallSession(line, {
          callSid: `web_${newId()}`,
          callerPhone: null,
          appUrl: config.appUrl ?? origin,
          onEnd: (ended) => sessions.delete(ended),
        })
        sessions.add(session)
        session.start()
        return
      case "media":
        session?.onCallerAudio(message.media.payload)
        return
      case "mark":
        session?.onMark(message.mark.name)
        return
      case "stop":
        session?.onCallerHangup()
        return
    }
  })
  ws.on("close", () => session?.onCallerHangup())
  ws.on("error", (error) => console.warn("Browser socket error:", error.message))
}

server.listen(config.port, () => {
  console.log(`Relay listening on http://localhost:${config.port}`)
  console.log(`  browser calls: ws://localhost:${config.port}/browser`)
  console.log(
    `  allowed pages: ${config.allowedOrigins.join(", ") || "any http://localhost page"}`
  )
  console.log(
    `  voice: ${config.voice}, turn detection: ${config.turnDetection}` +
      (config.turnDetection === "server_vad" ? ` (${config.silenceMs} ms pause ends a turn)` : "")
  )
  if (!config.staffPhone) {
    console.log("  STAFF_PHONE_NUMBER is not set; hand-offs have nowhere to ring.")
  }
})

function shutdown() {
  console.log("Relay shutting down")
  for (const session of sessions) {
    session.end("The ordering line restarted. Please call again.")
  }
  server.close()
  // Give sessions a moment to save their call records.
  setTimeout(() => process.exit(0), 500).unref()
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
