import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

export const AUTH_COOKIE_NAME = "ods_session"
const SESSION_TTL_SECONDS = 60 * 60 * 12
const PBKDF2_ITERATIONS = 120_000
const PBKDF2_KEYLEN = 64
const PBKDF2_DIGEST = "sha512"

type SessionUser = {
  id: string
  username: string
  role: string
  name: string
}

type SessionPayload = SessionUser & {
  exp: number
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || "dev-only-change-me"
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8")
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url")
}

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = pbkdf2Sync(plainPassword, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString("hex")
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`
}

export function verifyPassword(plainPassword: string, storedPassword: string): { valid: boolean; needsRehash: boolean } {
  if (storedPassword.startsWith("pbkdf2$")) {
    const parts = storedPassword.split("$")
    if (parts.length !== 4) return { valid: false, needsRehash: false }
    const iterations = Number(parts[1])
    const salt = parts[2]
    const storedHash = parts[3]
    if (!Number.isFinite(iterations) || !salt || !storedHash) return { valid: false, needsRehash: false }
    const computed = pbkdf2Sync(plainPassword, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString("hex")
    if (computed.length !== storedHash.length) return { valid: false, needsRehash: false }
    const valid = timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash))
    return { valid, needsRehash: false }
  }

  const valid = plainPassword === storedPassword
  return { valid, needsRehash: valid }
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const encodedPayload = b64urlEncode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function getSessionFromToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".")
  if (!encodedPayload || !signature) return null

  const expectedSignature = signPayload(encodedPayload)
  if (signature.length !== expectedSignature.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null

  try {
    const parsed = JSON.parse(b64urlDecode(encodedPayload)) as SessionPayload
    if (!parsed?.id || !parsed?.username || !parsed?.role || !parsed?.name || !parsed?.exp) return null
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null
    return parsed
  } catch {
    return null
  }
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!token) return null
  return getSessionFromToken(token)
}

export function setAuthCookie(res: NextResponse, token: string) {
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearAuthCookie(res: NextResponse) {
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export function requireAuth(req: NextRequest, allowedRoles?: string[]) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { session, error: null }
}
