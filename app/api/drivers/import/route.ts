import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import * as XLSX from "xlsx"

const VALID_VEHICLE_TYPES = ["舒适型", "豪华型", "商务型", "经济型"]

// 处理电话号码：去除 +86- 或 +86 前缀，只保留数字
function normalizePhone(raw: string): string {
  return raw.replace(/^\+86[-\s]?/, "").replace(/\D/g, "")
}

function str(v: unknown): string {
  return String(v ?? "").trim()
}

// POST /api/drivers/import  — multipart form: file
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const importedBy = (formData.get("importedBy") as string) || "unknown"

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // 按行列索引读取（避免重复 header 互相覆盖）
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  if (raw.length < 2) {
    return NextResponse.json({ error: "文件内容不足" }, { status: 400 })
  }

  // 第一行是表头，找到各列的位置
  const headerRow = raw[0].map(v => str(v))

  // 找到第一次出现某列名的位置（处理重复 header）
  function col(name: string): number {
    return headerRow.indexOf(name)
  }

  const idxVehicleType  = col("车型")        // 第一个"车型"列 = 预订车型
  const idxPlate        = col("车号")
  const idxName         = col("司机")
  const idxPhone        = col("司机电话")
  const idxHome         = col("住")
  const idxLimit        = col("日单上限")

  const errors: { row: number; field: string; message: string }[] = []
  const toCreate: Parameters<typeof db.driver.create>[0]["data"][] = []

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]
    const rowNum = i + 1

    const vehicleType  = idxVehicleType  >= 0 ? str(r[idxVehicleType])  : ""
    const vehiclePlate = idxPlate        >= 0 ? str(r[idxPlate])        : ""
    const name         = idxName         >= 0 ? str(r[idxName])         : ""
    const rawPhone     = idxPhone        >= 0 ? str(r[idxPhone])        : ""
    const phone        = normalizePhone(rawPhone)
    const homeAddress  = idxHome         >= 0 ? str(r[idxHome])         : ""
    const limitRaw     = idxLimit        >= 0 ? str(r[idxLimit])        : ""
    const dailyOrderLimit = parseInt(limitRaw || "10", 10)

    // 跳过空行（序号行或分组标题行）
    if (!name && !vehiclePlate) continue

    if (!name)         errors.push({ row: rowNum, field: "司机",    message: "不能为空" })
    if (!phone)        errors.push({ row: rowNum, field: "司机电话", message: "不能为空" })
    if (!vehiclePlate) errors.push({ row: rowNum, field: "车号",    message: "不能为空" })
    if (!VALID_VEHICLE_TYPES.includes(vehicleType)) {
      errors.push({ row: rowNum, field: "车型", message: `无效车型"${vehicleType}"，应为 舒适型/豪华型/商务型/经济型` })
    }

    if (!name || !phone || !vehiclePlate || !VALID_VEHICLE_TYPES.includes(vehicleType)) continue

    toCreate.push({
      name,
      phone,
      vehicleType,
      vehiclePlate,
      homeAddress,
      homeLat: 0,
      homeLng: 0,
      dailyOrderLimit: isNaN(dailyOrderLimit) ? 10 : dailyOrderLimit,
    })
  }

  // 批量写入，跳过重复车牌/电话
  let successRows = 0
  for (const data of toCreate) {
    try {
      await db.driver.create({ data: data as Parameters<typeof db.driver.create>[0]["data"] })
      successRows++
    } catch {
      const plate = (data as { vehiclePlate: string }).vehiclePlate
      errors.push({ row: -1, field: "车号/电话", message: `"${plate}" 已存在，已跳过` })
    }
  }

  await db.importBatch.create({
    data: {
      fileName: file.name,
      totalRows: raw.length - 1,
      successRows,
      errorRows: (raw.length - 1) - successRows,
      errors: JSON.stringify(errors),
      importedBy,
    },
  })

  return NextResponse.json({
    success: true,
    successRows,
    errorRows: (raw.length - 1) - successRows,
    errors,
    detectedHeaders: headerRow,
  })
}
