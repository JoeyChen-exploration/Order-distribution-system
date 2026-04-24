import { z } from "zod"

const vehicleTypeSchema = z.enum(["豪华商务型", "普通商务型", "舒适型", "豪华型", "商务型", "经济型"])
const driverStatusSchema = z.enum(["available", "busy", "off_duty", "on_leave"])

export const batchDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
}).strict()

export const createDriverSchema = z.object({
  name: z.string().trim().min(1).max(64),
  phone: z.string().trim().min(6).max(32),
  vehicleType: vehicleTypeSchema,
  vehiclePlate: z.string().trim().min(1).max(24),
  homeAddress: z.string().trim().min(1).max(256),
  homeLat: z.number().finite(),
  homeLng: z.number().finite(),
  status: driverStatusSchema.default("available"),
  dailyOrderCount: z.number().int().min(0).max(999).default(0),
  currentLat: z.number().finite().optional(),
  currentLng: z.number().finite().optional(),
  workingHours: z.string().trim().max(32).optional(),
}).strict()

export const updateDriverSchema = createDriverSchema.partial().strict()

export const createOrderSchema = z.object({
  orderNo: z.string().trim().min(1).max(64),
  passengerName: z.string().trim().max(64).default(""),
  passengerPhone: z.string().trim().max(32).default(""),
  flightNo: z.string().trim().max(32).default(""),
  flightDate: z.string().trim().min(1).max(32),
  pickupTime: z.string().trim().max(16).default(""),
  pickupAddress: z.string().trim().min(1).max(256),
  pickupLat: z.number().finite(),
  pickupLng: z.number().finite(),
  dropoffAddress: z.string().trim().min(1).max(256),
  dropoffLat: z.number().finite(),
  dropoffLng: z.number().finite(),
  reqVehicleType: vehicleTypeSchema,
  status: z.number().int().min(0).max(5).default(0),
  isEmergency: z.boolean().default(false),
  driverId: z.string().trim().min(1).optional().nullable(),
  driverName: z.string().trim().max(64).optional().nullable(),
  cancelReason: z.string().trim().max(255).optional().nullable(),
  cancelTime: z.string().trim().max(32).optional().nullable(),
  modifiedUserId: z.string().trim().max(64).optional().nullable(),
  modifiedAt: z.string().trim().max(32).optional().nullable(),
  importBatchId: z.string().trim().max(64).optional().nullable(),
  metadata: z.string().max(20000).optional().nullable(),
}).strict()

export const updateOrderSchema = createOrderSchema.partial().strict()

export const createDispatchHistorySchema = z.object({
  totalOrders: z.number().int().min(0).max(100000),
  matched: z.number().int().min(0).max(100000),
  unmatched: z.number().int().min(0).max(100000),
  items: z.array(z.unknown()).max(100000),
}).strict()
