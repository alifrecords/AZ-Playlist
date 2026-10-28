// GET /api/push/key — bildirishnoma obunasi uchun ochiq VAPID kaliti
import { guard, json, vapidKeys } from "../_db.js";
export const onRequestGet = guard(async ({ env }) => json({ key: (await vapidKeys(env.DB)).pub }));
