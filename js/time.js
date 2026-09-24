// أدوات الوقت. كل الحجوزات مخزّنة كـ (يوم + دقيقة من منتصف الليل) بتوقيت الصالون،
// فما في لخبطة توقيت إذا الزبون فاتح الموقع من جهاز على توقيت ثاني.

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

const pad = (n) => String(n).padStart(2, '0');

export function nowIn(tz = 'Asia/Jerusalem') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: +parts.hour * 60 + +parts.minute };
}

function toUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key, n) {
  const d = toUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dow = (key) => toUTC(key).getUTCDay();
export const dayNum = (key) => toUTC(key).getUTCDate();
export const monthName = (key) => MONTHS[toUTC(key).getUTCMonth()];
export const hm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const fmtMin = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

export function fmtDayLong(key) {
  return `${DAY_NAMES[dow(key)]} ${dayNum(key)} ${monthName(key)}`;
}

// 12 ساعة بالعربي: 4:30 م
export function fmtClock(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad(m)} ${h < 12 ? 'ص' : 'م'}`;
}

export function hoursFor(settings, key) {
  if ((settings.days_off || []).includes(key)) return null;
  const h = settings.hours?.[String(dow(key))];
  if (!h || h.closed) return null;
  return { open: hm(h.open), close: hm(h.close) };
}

// كل الأوقات الممكنة لخدمة مدّتها duration بيوم معيّن، مع حالة كل وقت.
export function buildSlots(settings, key, duration, busy) {
  const hrs = hoursFor(settings, key);
  if (!hrs) return [];
  const step = Number(settings.slot_step) || 30;
  const now = nowIn(settings.tz);
  const notice = Number(settings.min_notice_min) || 0;
  const taken = busy.filter((b) => b.day === key);
  const slots = [];
  for (let s = hrs.open; s + duration <= hrs.close; s += step) {
    const e = s + duration;
    let state = 'free';
    if (key < now.day || (key === now.day && s < now.min + notice)) state = 'past';
    else if (taken.some((b) => s < b.end_min && e > b.start_min)) state = 'taken';
    slots.push({ start: s, end: e, state });
  }
  return slots;
}
