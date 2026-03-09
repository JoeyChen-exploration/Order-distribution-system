/**
 * 初始化数据库：建表 + 创建默认用户
 * 运行: npm run db:init
 */
import { createClient } from "@libsql/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../lib/generated/prisma/client"

const libsql = createClient({ url: "file:prisma/dev.db" })

// 1. 直接用 libsql 建表（绕过 Prisma migrate 问题）
async function initTables() {
  await libsql.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "username" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'dispatcher',
      "name" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

    CREATE TABLE IF NOT EXISTS "Driver" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "vehicleType" TEXT NOT NULL,
      "vehiclePlate" TEXT NOT NULL,
      "homeAddress" TEXT NOT NULL DEFAULT '',
      "homeLat" REAL NOT NULL DEFAULT 0,
      "homeLng" REAL NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'available',
      "dailyOrderCount" INTEGER NOT NULL DEFAULT 0,
      "dailyOrderLimit" INTEGER NOT NULL DEFAULT 10,
      "currentLat" REAL,
      "currentLng" REAL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Driver_phone_key" ON "Driver"("phone");
    CREATE UNIQUE INDEX IF NOT EXISTS "Driver_vehiclePlate_key" ON "Driver"("vehiclePlate");

    CREATE TABLE IF NOT EXISTS "ImportBatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "fileName" TEXT NOT NULL,
      "totalRows" INTEGER NOT NULL,
      "successRows" INTEGER NOT NULL,
      "errorRows" INTEGER NOT NULL,
      "errors" TEXT NOT NULL DEFAULT '[]',
      "importedBy" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Order" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderNo" TEXT NOT NULL,
      "passengerName" TEXT NOT NULL,
      "passengerPhone" TEXT NOT NULL,
      "flightNo" TEXT NOT NULL,
      "flightDate" TEXT NOT NULL,
      "pickupTime" TEXT NOT NULL,
      "pickupAddress" TEXT NOT NULL,
      "pickupLat" REAL NOT NULL DEFAULT 0,
      "pickupLng" REAL NOT NULL DEFAULT 0,
      "dropoffAddress" TEXT NOT NULL,
      "dropoffLat" REAL NOT NULL DEFAULT 0,
      "dropoffLng" REAL NOT NULL DEFAULT 0,
      "reqVehicleType" TEXT NOT NULL,
      "status" INTEGER NOT NULL DEFAULT 0,
      "isEmergency" BOOLEAN NOT NULL DEFAULT false,
      "cancelReason" TEXT,
      "cancelTime" TEXT,
      "modifiedAt" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "driverId" TEXT,
      "driverName" TEXT,
      "modifiedUserId" TEXT,
      "importBatchId" TEXT,
      CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Order_modifiedUserId_fkey" FOREIGN KEY ("modifiedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Order_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNo_key" ON "Order"("orderNo");
  `)
  console.log("✓ 数据库表已创建")
}

// 2. 用 Prisma Client 写入默认数据
async function seedData() {
  const adapter = new PrismaLibSql({ url: "file:prisma/dev.db" })
  const db = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", password: "admin123", role: "super_admin", name: "超级管理员" },
  })
  await db.user.upsert({
    where: { username: "dispatcher" },
    update: {},
    create: { username: "dispatcher", password: "dispatch123", role: "dispatcher", name: "调度员" },
  })

  console.log("✓ 默认用户已创建")
  console.log("  admin / admin123（超级管理员）")
  console.log("  dispatcher / dispatch123（调度员）")

  await db.$disconnect()
}

initTables()
  .then(seedData)
  .catch(console.error)
  .finally(() => libsql.close())
