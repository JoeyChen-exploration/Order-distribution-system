import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/drivers/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const driver = await db.driver.findUnique({ where: { id } })
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(driver)
}

// PATCH /api/drivers/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const driver = await db.driver.update({ where: { id }, data: body })
  return NextResponse.json(driver)
}

// DELETE /api/drivers/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.driver.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
