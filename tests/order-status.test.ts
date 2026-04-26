import test from "node:test"
import assert from "node:assert/strict"
import { canTransitionOrderStatus } from "../lib/order-status"

test("order status: allow expected transitions", () => {
  assert.equal(canTransitionOrderStatus(0, 1), true)
  assert.equal(canTransitionOrderStatus(1, 2), true)
  assert.equal(canTransitionOrderStatus(2, 3), true)
  assert.equal(canTransitionOrderStatus(1, 0), true)
  assert.equal(canTransitionOrderStatus(5, 0), true)
})

test("order status: reject invalid transitions", () => {
  assert.equal(canTransitionOrderStatus(0, 3), false)
  assert.equal(canTransitionOrderStatus(3, 1), false)
  assert.equal(canTransitionOrderStatus(4, 0), false)
  assert.equal(canTransitionOrderStatus(2, 5), false)
})
