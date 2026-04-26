import { NextRequest, NextResponse } from "next/server"

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"

export function getRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id") || crypto.randomUUID()
}

export function jsonWithRequestId(data: unknown, requestId: string, status = 200, headers?: HeadersInit) {
  return NextResponse.json(
    { ...((typeof data === "object" && data !== null) ? (data as Record<string, unknown>) : { data }), requestId },
    {
      status,
      headers: {
        "x-request-id": requestId,
        ...(headers || {}),
      },
    },
  )
}

export function errorWithRequestId(args: {
  requestId: string
  status: number
  code: ApiErrorCode
  message: string
  details?: unknown
  headers?: HeadersInit
}) {
  return NextResponse.json(
    {
      error: {
        code: args.code,
        message: args.message,
        details: args.details ?? null,
      },
      requestId: args.requestId,
    },
    {
      status: args.status,
      headers: {
        "x-request-id": args.requestId,
        ...(args.headers || {}),
      },
    },
  )
}
