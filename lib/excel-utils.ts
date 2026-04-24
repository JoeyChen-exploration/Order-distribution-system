import ExcelJS from "exceljs"

export type CellValue = string | number | boolean | Date

function resolveCell(cell: ExcelJS.Cell): CellValue {
  const v = cell.value
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v
  if (typeof v === "object") {
    if ("richText" in v) {
      return (v as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join("")
    }
    if ("result" in v) {
      const result = (v as ExcelJS.CellFormulaValue).result
      if (result instanceof Date) return result
      return (result as CellValue) ?? ""
    }
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text
  }
  return v as CellValue
}

export async function parseXlsx(buffer: ArrayBuffer | Buffer): Promise<CellValue[][]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const colCount = worksheet.columnCount
  const rows: CellValue[][] = []
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowData: CellValue[] = []
    for (let c = 1; c <= colCount; c++) {
      rowData.push(resolveCell(row.getCell(c)))
    }
    rows.push(rowData)
  })
  return rows
}
