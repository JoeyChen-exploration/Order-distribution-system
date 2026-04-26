import test from "node:test"
import assert from "node:assert/strict"
import { normalizeOrderPayload } from "../lib/order-consistency"

test("normalizeOrderPayload: maps 商务型 to 普通商务型", () => {
  const output = normalizeOrderPayload({
    reqVehicleType: "商务型",
  })
  assert.equal(output.reqVehicleType, "普通商务型")
})

test("normalizeOrderPayload: aligns metadata keys for service type and airport code", () => {
  const output = normalizeOrderPayload({
    metadata: JSON.stringify({
      serviceType: "接机/站",
      airportCode: "pvg",
    }),
  })

  const meta = JSON.parse(String(output.metadata))
  assert.equal(meta["服务类型"], "接机/站")
  assert.equal(meta.serviceType, "接机/站")
  assert.equal(meta["三字码"], "PVG")
  assert.equal(meta.airportCode, "PVG")
})
