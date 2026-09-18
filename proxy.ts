import { NextResponse, type NextRequest } from "next/server"

// The call dashboard shows callers' names, addresses and transcripts. When
// DASHBOARD_PASSWORD is set, it asks for that password (HTTP Basic auth, any
// username). Unset, as in local development, it stays open.
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) return NextResponse.next()

  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(
    " "
  )
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded)
    if (sameText(decoded.slice(decoded.indexOf(":") + 1), password)) {
      return NextResponse.next()
    }
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Calls", charset="UTF-8"' },
  })
}

export const config = { matcher: ["/calls", "/calls/:path*"] }

/** Compares in constant time, so response timing doesn't leak the password. */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
