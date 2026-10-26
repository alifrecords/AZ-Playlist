# AZIMXODJAYEV MUSIC — playlist platformasi

Telegram kanal uchun bepul playlist sayti. Qo'shiqlar GitHub'da saqlanadi, Cloudflare Pages ularni saytga chiqaradi, Telegram esa saytni Mini App sifatida ochadi.

| Fayl | Vazifasi |
| --- | --- |
| `index.html` | Xonandalar ko'radigan playlist (Telegram Mini App) |
| `admin.html` | Faqat siz uchun: qo'shiq joylash, kesish, o'chirish, almashtirish |
| `playlist.json` | Qo'shiqlar ro'yxati. Admin sahifa uni o'zi yangilaydi |
| `music/` | MP3 fayllar (to'liq qo'shiq va introlar) |
| `media/` | Slaydlar: rasm, GIF, video |
| `_headers` | Cloudflare kesh sozlamalari |

Xarajat: **0 so'm**. GitHub, Cloudflare Pages va Telegram bepul.

---

## 1. GitHub'da repozitoriy ochish

1. github.com ga `alifrecords` hisobi bilan kiring.
2. **New repository** → nomi: `az-playlist` → **Public** yoki **Private** (ikkalasi ham ishlaydi) → **Create repository**.
3. **uploading an existing file** havolasini bosing va shu papkadagi **barcha fayl va papkalarni** sudrab tashlang → **Commit changes**.

## 2. Cloudflare Pages'ga ulash

1. dash.cloudflare.com da bepul hisob oching.
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → GitHub'ni ulang va `az-playlist` repozitoriyini tanlang.
3. Sozlamalar:
   - Framework preset: **None**
   - Build command: **bo'sh qoldiring**
   - Build output directory: **/**
4. **Save and Deploy**. 1–2 daqiqada sayt tayyor bo'ladi: `https://az-playlist.pages.dev` (nom band bo'lsa, Cloudflare boshqa nom beradi).

Endi repoga har qanday o'zgarish tushsa, Cloudflare saytni o'zi yangilaydi.

## 3. Admin uchun token (parol) yaratish

1. github.com/settings/personal-access-tokens/new sahifasini oching.
2. **Token name:** `az-admin` · **Expiration:** 1 yil.
3. **Repository access:** *Only select repositories* → `az-playlist`.
4. **Permissions → Repository permissions → Contents:** *Read and write*.
5. **Generate token** → tokenni nusxalang (`github_pat_…`). U faqat bir marta ko'rsatiladi.

> Token — admin parolingiz. Uni hech kimga bermang va chatga yozmang. Yo'qotsangiz yoki begona bilib qolsa, GitHub'da **Revoke** qiling va yangisini yarating.

## 4. Admin sahifaga kirish

1. `https://az-playlist.pages.dev/admin.html` ni oching.
2. GitHub hisob: `alifrecords`, Repozitoriy: `az-playlist`, Branch: `main`, Token: yuqoridagi token → **Ulanish**.
3. **Sozlamalar:** buyurtma uchun Telegram nikingizni yozing (`@nik`) → yuqorida chiqqan **GitHub'ga saqlash** tugmasini bosing.
4. **+ Yangi qo'shiq** → audio faylni tanlang. Tizim BPM, tonallik, janr va naqarotni aniqlaydi. Parchani kesing, slayd qo'shing, **GitHub'ga joylash**.

Admin sahifa ommaviy manzilda tursa ham, tokensiz hech narsa o'zgartirib bo'lmaydi. Token faqat siz kirgan brauzerda saqlanadi.

## 5. Telegram Mini App

1. Telegram'da **@BotFather** → `/newbot` → bot nomi, masalan `AZ Music` va `@azmusic_playlist_bot`.
2. `/newapp` → botni tanlang → nom, tavsif, 640×360 rasm → **Web App URL:** `https://az-playlist.pages.dev` → qisqa nom: `playlist`.
3. BotFather havola beradi: `https://t.me/azmusic_playlist_bot/playlist`. Shu havolani admin sahifadagi **Mini App havolasi** maydoniga yozib saqlang. Shunda "Do'stga yuborish" havolalari to'g'ridan-to'g'ri Telegram ichida ochiladi.
4. Ixtiyoriy: `/mybots` → bot → **Bot Settings** → **Menu Button** → shu URL. Botda pastki chap tugma playlistni ochadi.
5. Kanalingizga post qiling: muqova rasm + matn + `https://t.me/azmusic_playlist_bot/playlist` havolasi. Telegram uni "Ochish" tugmasi bilan ko'rsatadi.

Qo'shiqqa to'g'ridan-to'g'ri havola: `https://t.me/azmusic_playlist_bot/playlist?startapp=QO'SHIQ_ID` — sayt shu qo'shiqni ochib beradi. "Do'stga yuborish" tugmasi bu havolani o'zi yasaydi.

---

## Cheklovlar (bepul tarif)

- Bitta fayl **25 MB gacha**, saytda **20 000 tagacha** fayl. 192 kbps MP3 da 4 daqiqalik qo'shiq ≈ 5.5 MB.
- Saytdagi MP3 lar ommaviy: tinglash nusxasi sifatida qo'ying. **Asl WAV va stemlarni** xaridorga to'lovdan keyin Telegram orqali shaxsan yuboring.
- GitHub repo hajmi 1 GB atrofida bo'lishi tavsiya etiladi: bu taxminan 150–180 ta qo'shiq + intro. Ko'payganda eski introlarni o'chiring yoki keyin Cloudflare R2 ga o'tamiz.
- Telegram ichida ekran o'chsa, ba'zi telefonlarda ijro to'xtashi mumkin. Bu Telegram cheklovi.

## Muammo bo'lsa

| Belgi | Sabab va yechim |
| --- | --- |
| "Token noto'g'ri" | Token muddati tugagan yoki xato nusxalangan. Yangisini yarating. |
| "Ruxsat yo'q" | Tokenga `az-playlist` uchun **Contents: Read and write** berilmagan. |
| Joylandi, lekin saytda yo'q | Cloudflare 1–2 daqiqada yangilaydi. Cloudflare → Deployments da holatni ko'ring. |
| Qo'shiq chalinmaydi | Fayl 25 MB dan katta bo'lishi mumkin. Admin da sifatni 160 yoki 128 kbps qiling. |

© AZIMXODJAYEV. Barcha qo'shiqlar mualliflik huquqi bilan himoyalangan.
