import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import * as XLSX from "xlsx"

const VALID_VEHICLE_TYPES = ["豪华商务型", "普通商务型", "舒适型", "豪华型", "商务型", "经济型"]

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  if (!address) return { lat: 0, lng: 0 }
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    const res = await fetch(
      `${base}/api/geocode?address=${encodeURIComponent(address)}&city=上海`
    )
    const data = await res.json()
    if (data.lat && data.lng) return { lat: data.lat, lng: data.lng }
  } catch {}
  return { lat: 0, lng: 0 }
}

// 处理电话号码：去除 +86- 或 +86 前缀，只保留数字
function normalizePhone(raw: string): string {
  return raw.replace(/^\+86[-\s]?/, "").replace(/\D/g, "")
}

function str(v: unknown): string {
  return String(v ?? "").trim()
}

// POST /api/drivers/import  — multipart form: file
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/octet-stream", // some browsers send this for xlsx
])
const MAX_ROWS = 5000

export async function POST(req: NextRequest) {
  try {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const importedBy = (formData.get("importedBy") as string) || "unknown"

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "文件不能超过 10 MB" }, { status: 400 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
    return NextResponse.json({ error: "仅支持 xlsx / xls / csv 格式" }, { status: 400 })
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "文件类型不支持" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // 按行列索引读取（避免重复 header 互相覆盖）
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  if (raw.length < 2) {
    return NextResponse.json({ error: "文件内容不足" }, { status: 400 })
  }

  if (raw.length > MAX_ROWS) {
    return NextResponse.json({ error: `文件行数不能超过 ${MAX_ROWS} 行` }, { status: 400 })
  }

  // 第一行是表头，找到各列的位置
  const headerRow = raw[0].map(v => str(v))

  // 找到第一次出现某列名的位置（处理重复 header）
  function col(name: string): number {
    return headerRow.indexOf(name)
  }

  const idxVehicleType  = col("车型")
  const idxPlate        = col("车号")
  const idxName         = col("司机")
  const idxPhone        = col("司机电话")
  const idxHome         = col("住")
  const idxWorkingHours = col("时间")

  const errors: { row: number; field: string; message: string }[] = []

  type DriverData = {
    name: string; phone: string; vehicleType: string; vehiclePlate: string
    homeAddress: string; homeLat: number; homeLng: number; workingHours: string
  }
  const toUpsert: { rowNum: number; data: DriverData }[] = []

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]
    const rowNum = i + 1

    const rawVehicleType = idxVehicleType >= 0 ? str(r[idxVehicleType]) : ""
    const vehicleType = rawVehicleType === "商务型" ? "普通商务型" : rawVehicleType
    const vehiclePlate = idxPlate        >= 0 ? str(r[idxPlate])        : ""
    const name         = idxName         >= 0 ? str(r[idxName])         : ""
    const rawPhone     = idxPhone        >= 0 ? str(r[idxPhone])        : ""
    const phone        = normalizePhone(rawPhone)
    const homeAddress  = idxHome         >= 0 ? str(r[idxHome])         : ""
    const workingHours = idxWorkingHours >= 0 ? str(r[idxWorkingHours]) : ""

    // 跳过空行（序号行或分组标题行）
    if (!name && !vehiclePlate) continue

    if (!name)         errors.push({ row: rowNum, field: "司机",    message: "不能为空" })
    if (!phone)        errors.push({ row: rowNum, field: "司机电话", message: "不能为空" })
    if (!vehiclePlate) errors.push({ row: rowNum, field: "车号",    message: "不能为空" })
    if (!VALID_VEHICLE_TYPES.includes(vehicleType)) {
      errors.push({ row: rowNum, field: "车型", message: `无效车型"${vehicleType}"，应为 豪华商务型/普通商务型/豪华型/舒适型/商务型/经济型` })
    }
    if (!workingHours) {
      errors.push({ row: rowNum, field: "时间", message: "工作时间不能为空，格式：HH:MM-HH:MM（如 06:00-22:00）" })
    } else if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(workingHours)) {
      errors.push({ row: rowNum, field: "时间", message: `工作时间格式错误"${workingHours}"，应为 HH:MM-HH:MM` })
    }

    const workingHoursValid = workingHours && /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(workingHours)
    if (!name || !phone || !vehiclePlate || !VALID_VEHICLE_TYPES.includes(vehicleType) || !workingHoursValid) continue

    const homeCoord = homeAddress ? await geocodeAddress(homeAddress) : { lat: 0, lng: 0 }
    toUpsert.push({
      rowNum,
      data: {
        name, phone, vehicleType, vehiclePlate, homeAddress,
        homeLat: homeCoord.lat, homeLng: homeCoord.lng,
        workingHours,
      },
    })
  }

  // 批量写入：有则更新，无则创建
  let successRows = 0
  for (const { data } of toUpsert) {
    try {
      const existing = await db.driver.findFirst({
        where: { OR: [{ vehiclePlate: data.vehiclePlate }, { phone: data.phone }] },
      })
      if (existing) {
        await db.driver.update({ where: { id: existing.id }, data })
      } else {
        await db.driver.create({ data })
      }
      successRows++
    } catch (e) {
      errors.push({ row: -1, field: "车号/电话", message: `"${data.vehiclePlate}" 写入失败: ${String(e)}` })
    }
  }

  await db.importBatch.create({
    data: {
      fileName: file.name,
      totalRows: raw.length - 1,
      successRows,
      errorRows: toUpsert.length - successRows,
      errors: JSON.stringify(errors),
      importedBy,
    },
  })

  return NextResponse.json({
    success: true,
    successRows,
    errorRows: toUpsert.length - successRows,
    errors,
    detectedHeaders: headerRow,
  })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
