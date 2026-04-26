import test from "node:test"
import assert from "node:assert/strict"
import { assignOrderWithTx } from "../lib/order-assignment"

function buildTx(overrides?: Partial<any>) {
  const calls = {
    driverUpdate: [] as any[],
    orderUpdate: [] as any[],
  }

  const tx = {
    order: {
      findUnique: async (_args: any) => null,
      update: async (args: any) => {
        calls.orderUpdate.push(args)
        return { id: "o1", ...args?.data }
      },
    },
    driver: {
      findUnique: async (_args: any) => null,
      update: async (args: any) => {
        calls.driverUpdate.push(args)
        return { id: args?.where?.id, ...args?.data }
      },
    },
    ...overrides,
  }

  return { tx, calls }
}

test("assignOrderWithTx: rejects non-future order", async () => {
  const today = new Date()
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const { tx } = buildTx({
    order: {
      findUnique: async () => ({
        id: "o1",
        orderNo: "A-1",
        flightDate: d,
        status: 0,
        driverId: null,
        driverName: null,
      }),
      update: async () => ({ id: "o1" }),
    },
    driver: {
      findUnique: async () => ({
        id: "d1",
        status: "available",
        name: "张三",
      }),
      update: async () => ({ id: "d1" }),
    },
  })

  const result = await assignOrderWithTx(tx, {
    orderId: "o1",
    driverId: "d1",
    actorUserId: "u1",
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "ORDER_NOT_FUTURE")
  }
})

test("assignOrderWithTx: idempotent when already assigned to same driver", async () => {
  let orderFindCount = 0
  const { tx, calls } = buildTx({
    order: {
      findUnique: async () => {
        orderFindCount += 1
        if (orderFindCount === 1) {
          return {
            id: "o1",
            orderNo: "A-1",
            flightDate: "2099-01-01",
            status: 1,
            driverId: "d1",
            driverName: "张三",
          }
        }
        return {
          id: "o1",
          orderNo: "A-1",
          flightDate: "2099-01-01",
          status: 1,
          driverId: "d1",
          driverName: "张三",
          driver: { id: "d1", name: "张三" },
        }
      },
      update: async () => ({ id: "o1" }),
    },
    driver: {
      findUnique: async () => ({
        id: "d1",
        status: "busy",
        name: "张三",
      }),
      update: async () => ({ id: "d1" }),
    },
  })

  const result = await assignOrderWithTx(tx, {
    orderId: "o1",
    driverId: "d1",
    actorUserId: "u1",
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.idempotent, true)
    assert.equal(result.previousDriverId, "d1")
  }
  assert.equal(calls.driverUpdate.length, 0)
  assert.equal(calls.orderUpdate.length, 0)
})

test("assignOrderWithTx: reassign releases previous driver and updates target driver", async () => {
  let orderFindCount = 0
  const { tx, calls } = buildTx({
    order: {
      findUnique: async () => {
        orderFindCount += 1
        if (orderFindCount === 1) {
          return {
            id: "o1",
            orderNo: "A-1",
            flightDate: "2099-01-01",
            status: 1,
            driverId: "d-old",
            driverName: "旧司机",
          }
        }
        return {
          id: "o1",
          orderNo: "A-1",
          flightDate: "2099-01-01",
          status: 1,
          driverId: "d-new",
          driverName: "新司机",
          driver: { id: "d-new", name: "新司机" },
        }
      },
      update: async (args: any) => {
        calls.orderUpdate.push(args)
        return {
          id: "o1",
          orderNo: "A-1",
          ...args.data,
          driver: { id: "d-new", name: "新司机" },
        }
      },
    },
    driver: {
      findUnique: async () => ({
        id: "d-new",
        status: "available",
        name: "新司机",
      }),
      update: async (args: any) => {
        calls.driverUpdate.push(args)
        return { id: args.where.id, ...args.data }
      },
    },
  })

  const result = await assignOrderWithTx(tx, {
    orderId: "o1",
    driverId: "d-new",
    actorUserId: "u1",
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.idempotent, false)
    assert.equal(result.previousDriverId, "d-old")
  }
  assert.equal(calls.driverUpdate.length, 2)
  assert.equal(calls.driverUpdate[0].where.id, "d-old")
  assert.equal(calls.driverUpdate[0].data.status, "available")
  assert.equal(calls.driverUpdate[1].where.id, "d-new")
  assert.equal(calls.driverUpdate[1].data.status, "busy")
  assert.equal(calls.orderUpdate.length, 1)
  assert.equal(calls.orderUpdate[0].data.driverId, "d-new")
})
