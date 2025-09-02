# 929 Integrator (עם דלת – x-api-token)

מטבח קטן שעושה 2 דברים לעוזר שלך: (1) קורא עמודי 929 עד הסוף; (2) מביא תמלול מיוטיוב (אם יש).

## צעד 1: חשבון ב‑Vercel
https://vercel.com → Sign up (עם Google)

## צעד 2: העלאת הפרויקט
Dashboard → New Project → Upload / Drag & Drop → בחרו את התיקייה/ZIP הזה → Deploy.
בסוף תקבלו כתובת כמו: https://your-app.vercel.app

## צעד 3: לשים "דלת" (סיסמה)
Project Settings → Environment Variables:
- Key: TOKEN
- Value: (בחרו סיסמה, למשל) amit929!
- Scope: Production
Redeploy.

## בדיקה ידנית
שלחו כותרת (Header) בשם x-api-token עם אותה הסיסמה.
curl -H "x-api-token: amit929!" "https://your-app.vercel.app/api/scrape929?url=https://www.929.org.il/page/1"

## חיבור ל‑ChatGPT (Actions)
Actions → Import from OpenAPI → העלו openapi.json.
בחרו Auth Type: API Key; Header name: x-api-token; Key: (אותה סיסמה שהגדרתם).
שמרו.

מכאן העוזר יוכל לקרוא את דפי 929 + להביא תמלולים, ולהחזיר סיכום אינטגרטיבי עם הערות שוליים.
