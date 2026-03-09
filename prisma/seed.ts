import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../lib/generated/prisma/client"

const adapter = new PrismaLibSql({ url: "file:prisma/dev.db" })
const db = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

async function main() {
  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: "admin123",
      role: "super_admin",
      name: "超级管理员",
    },
  })

  await db.user.upsert({
    where: { username: "dispatcher" },
    update: {},
    create: {
      username: "dispatcher",
      password: "dispatch123",
      role: "dispatcher",
      name: "调度员",
    },
  })

  console.log("✓ Seed 完成：已创建默认用户")
  console.log("  admin / admin123  （超级管理员）")
  console.log("  dispatcher / dispatch123  （调度员）")
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
