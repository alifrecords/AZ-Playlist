// GET /api/push/latest — oxirgi xabar matni (telefon bildirishnomani ko'rsatishda o'qiydi)
import { guard, json, kvGet } from "../_db.js";
export const onRequestGet = guard(async ({ env }) => {
  const n = await kvGet(env.DB, "last_notif");
  return json(n ? JSON.parse(n) : { title: "AZ MUSIC", body: "Yangi qo'shiq joylandi — tinglash uchun bosing", url: "/" });
});
