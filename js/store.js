// طبقة البيانات. نفس الواجهة بوضعين:
//  - remote: Supabase (REST + RPC). منع الحجز المزدوج مضمون داخل القاعدة نفسها.
//  - local:  وضع تجريبي على نفس الجهاز (localStorage) لحد ما تنربط القاعدة.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { nowIn, addDays, hoursFor } from './time.js';

export const ERRORS = {
  SLOT_TAKEN: 'هاد الوقت انحجز هلّق من حدا ثاني. اختار وقت ثاني.',
  BAD_SERVICE: 'الخدمة مش متوفرة حالياً.',
  BAD_NAME: 'اكتب اسمك (حرفين على الأقل).',
  BAD_PHONE: 'رقم التلفون مش مزبوط.',
  BAD_DAY: 'هاد اليوم برّا فترة الحجز.',
  DAY_OFF: 'الصالون مسكّر بهاد اليوم.',
  OUT_OF_HOURS: 'الوقت برّا ساعات الدوام.',
  TOO_LATE: 'هاد الوقت صار قريب كثير أو فات. اختار وقت أبعد.',
  TOO_MANY: 'عندك حجوزات فعّالة كفاية على هاد الرقم.',
  NOT_FOUND: 'ما لقينا حجز فعّال بهاد الكود والرقم.',
  BAD_PIN: 'الرمز غلط (أو انقفل مؤقتاً بعد محاولات كثيرة).',
  PIN_SHORT: 'الرمز لازم يكون 4 خانات على الأقل.',
  BAD_INPUT: 'في معلومة ناقصة أو غلط.',
  BAD_IMAGE: 'الصورة كبيرة كثير أو صيغتها مش مدعومة.',
  NETWORK: 'في مشكلة بالاتصال. جرّب كمان مرة.',
};
export const errText = (code) => ERRORS[code] || ERRORS.NETWORK;

// ---------------------------------------------------------------- remote

function remote() {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  async function get(path) {
    const r = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
    return r.json();
  }
  async function rpc(fn, args) {
    try {
      const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      if (!r.ok) return { error: 'NETWORK' };
      return await r.json();
    } catch { return { error: 'NETWORK' }; }
  }

  return {
    mode: 'remote',
    async loadPublic() {
      const [st, services, gallery] = await Promise.all([
        get('settings?select=data&id=eq.1'),
        get('services?select=id,name,description,price,duration_min,sort&order=sort.asc,created_at.asc'),
        get('gallery?select=id,image,caption&order=sort.asc'),
      ]);
      return { settings: st[0]?.data || {}, services, gallery };
    },
    async getBusy(from, to) {
      const r = await rpc('get_busy', { p_from: from, p_to: to });
      if (!Array.isArray(r)) throw new Error('busy');
      return r;
    },
    createBooking: (p) => rpc('create_booking', {
      p_service: p.service_id, p_day: p.day, p_start: p.start_min, p_name: p.name, p_phone: p.phone, p_note: p.note || '',
    }),
    cancelBooking: (code, phone) => rpc('cancel_booking', { p_code: code, p_phone: phone }),
    admin: {
      checkPin: (pin) => rpc('admin_check_pin', { p_pin: pin }),
      listBookings: (pin, from, to) => rpc('admin_list_bookings', { p_pin: pin, p_from: from, p_to: to }),
      addBooking: (pin, p) => rpc('admin_add_booking', { p_pin: pin, p }),
      setStatus: (pin, id, status) => rpc('admin_set_status', { p_pin: pin, p_id: id, p_status: status }),
      deleteBooking: (pin, id) => rpc('admin_delete_booking', { p_pin: pin, p_id: id }),
      listServices: (pin) => rpc('admin_list_services', { p_pin: pin }),
      saveService: (pin, p) => rpc('admin_save_service', { p_pin: pin, p }),
      deleteService: (pin, id) => rpc('admin_delete_service', { p_pin: pin, p_id: id }),
      saveSettings: (pin, p) => rpc('admin_save_settings', { p_pin: pin, p }),
      changePin: (pin, next) => rpc('admin_change_pin', { p_pin: pin, p_new: next }),
      addPhoto: (pin, image, caption) => rpc('admin_add_photo', { p_pin: pin, p_image: image, p_caption: caption }),
      deletePhoto: (pin, id) => rpc('admin_delete_photo', { p_pin: pin, p_id: id }),
    },
  };
}

// ---------------------------------------------------------------- local (تجريبي)

const LS_KEY = 'hossam-salon-v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const cleanPhone = (p) => String(p || '').replace(/[^0-9+]/g, '');

export const DEFAULT_SETTINGS = {
  salon_name: 'صالون حسام',
  tagline: 'قصّات شبابية بإيد وحدة ثابتة',
  phone: '', whatsapp: '', instagram: '', tiktok: '', address: '', maps_url: '',
  tz: 'Asia/Jerusalem', slot_step: 30, horizon_days: 14, min_notice_min: 30, max_active_per_phone: 2,
  days_off: [],
  hours: {
    0: { open: '10:00', close: '21:00', closed: false },
    1: { open: '10:00', close: '21:00', closed: false },
    2: { open: '10:00', close: '21:00', closed: false },
    3: { open: '10:00', close: '21:00', closed: false },
    4: { open: '10:00', close: '22:00', closed: false },
    5: { open: '13:00', close: '22:00', closed: false },
    6: { open: '10:00', close: '21:00', closed: false },
  },
};

function seed() {
  const s = (name, description, price, duration_min, sort) => ({ id: uid(), name, description, price, duration_min, sort, active: true });
  return {
    settings: DEFAULT_SETTINGS,
    pin: '4040',
    services: [
      s('قصّة شعر', 'قص وتنسيق حسب شكل الوجه وتصفيف بالآخر', 50, 30, 1),
      s('قصّة + دقن', 'قصّة كاملة مع تحديد وتهذيب الدقن', 70, 45, 2),
      s('فيد (Skin Fade)', 'تدريج على الناعم من الصفر، شغل دقيق', 60, 45, 3),
      s('تحديد دقن', 'حلاقة وتحديد بالموس مع منشفة سخنة', 30, 20, 4),
      s('قصّة ولاد (تحت 12)', 'قصّة مرتبة للصغار', 40, 30, 5),
      s('باكيج عريس', 'قصّة، دقن، تنظيف بشرة، واستشوار', 200, 90, 6),
    ],
    bookings: [],
    gallery: [],
  };
}

function local() {
  const read = () => {
    try { const d = JSON.parse(localStorage.getItem(LS_KEY)); if (d && d.settings) return d; } catch {}
    const d = seed(); write(d); return d;
  };
  const write = (d) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} };
  const pinOk = (pin) => pin === read().pin;
  const overlaps = (db, day, s, e, ignoreId) => db.bookings.some((b) => b.id !== ignoreId && b.status !== 'cancelled' && b.day === day && s < b.end_min && e > b.start_min);
  const guard = (fn) => async (pin, ...a) => (pinOk(pin) ? fn(...a) : { error: 'BAD_PIN' });

  return {
    mode: 'local',
    async loadPublic() {
      const d = read();
      return {
        settings: { ...DEFAULT_SETTINGS, ...d.settings },
        services: d.services.filter((s) => s.active).sort((a, b) => a.sort - b.sort),
        gallery: d.gallery,
      };
    },
    async getBusy(from, to) {
      return read().bookings.filter((b) => b.status !== 'cancelled' && b.day >= from && b.day <= to)
        .map(({ day, start_min, end_min }) => ({ day, start_min, end_min }));
    },
    async createBooking(p) {
      const d = read();
      const st = { ...DEFAULT_SETTINGS, ...d.settings };
      const svc = d.services.find((s) => s.id === p.service_id && s.active);
      const name = String(p.name || '').trim();
      const phone = cleanPhone(p.phone);
      const now = nowIn(st.tz);
      if (!svc) return { error: 'BAD_SERVICE' };
      if (name.length < 2 || name.length > 60) return { error: 'BAD_NAME' };
      const digits = phone.replace(/\D/g, '').length;
      if (digits < 9 || digits > 15) return { error: 'BAD_PHONE' };
      if (p.day < now.day || p.day > addDays(now.day, st.horizon_days)) return { error: 'BAD_DAY' };
      const hrs = hoursFor(st, p.day);
      if (!hrs) return { error: 'DAY_OFF' };
      const end = p.start_min + svc.duration_min;
      if (p.start_min < hrs.open || end > hrs.close) return { error: 'OUT_OF_HOURS' };
      if (p.day === now.day && p.start_min < now.min + st.min_notice_min) return { error: 'TOO_LATE' };
      const active = d.bookings.filter((b) => b.phone === phone && b.status === 'confirmed' && (b.day > now.day || (b.day === now.day && b.end_min > now.min))).length;
      if (active >= st.max_active_per_phone) return { error: 'TOO_MANY' };
      if (overlaps(d, p.day, p.start_min, end)) return { error: 'SLOT_TAKEN' };
      const b = {
        id: uid(), code: code6(), day: p.day, start_min: p.start_min, end_min: end,
        service_id: svc.id, service_name: svc.name, price: svc.price,
        customer_name: name, phone, note: String(p.note || '').slice(0, 200), status: 'confirmed', created_at: new Date().toISOString(),
      };
      d.bookings.push(b); write(d);
      return { ok: true, booking: b };
    },
    async cancelBooking(code, phone) {
      const d = read(); const now = nowIn(d.settings.tz);
      const b = d.bookings.find((x) => x.code === String(code).trim().toUpperCase() && x.phone === cleanPhone(phone) && x.status === 'confirmed'
        && (x.day > now.day || (x.day === now.day && x.start_min > now.min)));
      if (!b) return { error: 'NOT_FOUND' };
      b.status = 'cancelled'; write(d); return { ok: true };
    },
    admin: {
      checkPin: async (pin) => (pinOk(pin) ? { ok: true } : { error: 'BAD_PIN' }),
      listBookings: guard(async (from, to) => ({
        ok: true,
        bookings: read().bookings.filter((b) => b.day >= from && b.day <= to).sort((a, b) => (a.day + String(a.start_min).padStart(4, '0')).localeCompare(b.day + String(b.start_min).padStart(4, '0'))),
      })),
      addBooking: guard(async (p) => {
        const d = read();
        if (overlaps(d, p.day, +p.start_min, +p.end_min)) return { error: 'SLOT_TAKEN' };
        const svc = d.services.find((s) => s.id === p.service_id);
        const b = {
          id: uid(), code: code6(), day: p.day, start_min: +p.start_min, end_min: +p.end_min,
          service_id: svc?.id || null, service_name: svc?.name || '', price: svc?.price || 0,
          customer_name: p.customer_name || '', phone: cleanPhone(p.phone), note: p.note || '',
          status: p.status === 'blocked' ? 'blocked' : 'confirmed', created_at: new Date().toISOString(),
        };
        d.bookings.push(b); write(d); return { ok: true, booking: b };
      }),
      setStatus: guard(async (id, status) => {
        const d = read(); const b = d.bookings.find((x) => x.id === id);
        if (!b) return { ok: true };
        if (b.status === 'cancelled' && status !== 'cancelled' && overlaps(d, b.day, b.start_min, b.end_min, b.id)) return { error: 'SLOT_TAKEN' };
        b.status = status; write(d); return { ok: true };
      }),
      deleteBooking: guard(async (id) => { const d = read(); d.bookings = d.bookings.filter((b) => b.id !== id); write(d); return { ok: true }; }),
      listServices: guard(async () => ({ ok: true, services: read().services.slice().sort((a, b) => a.sort - b.sort) })),
      saveService: guard(async (p) => {
        const d = read();
        const price = Number(p.price), dur = Number(p.duration_min);
        if (!p.name || p.name.trim().length < 2 || !(price >= 0) || !(dur >= 10 && dur <= 240)) return { error: 'BAD_INPUT' };
        let s = d.services.find((x) => x.id === p.id);
        if (!s) { s = { id: uid(), sort: Math.max(0, ...d.services.map((x) => x.sort)) + 1, active: true }; d.services.push(s); }
        Object.assign(s, { name: p.name.trim(), description: (p.description || '').trim(), price, duration_min: dur, active: p.active ?? s.active, sort: p.sort ?? s.sort });
        write(d); return { ok: true, service: s };
      }),
      deleteService: guard(async (id) => { const d = read(); d.services = d.services.filter((s) => s.id !== id); write(d); return { ok: true }; }),
      saveSettings: guard(async (p) => { const d = read(); d.settings = { ...DEFAULT_SETTINGS, ...d.settings, ...p }; write(d); return { ok: true, settings: d.settings }; }),
      changePin: guard(async (next) => {
        if (String(next || '').length < 4) return { error: 'PIN_SHORT' };
        const d = read(); d.pin = next; write(d); return { ok: true };
      }),
      addPhoto: guard(async (image, caption) => {
        const d = read(); const g = { id: uid(), image, caption: caption || '' };
        d.gallery.push(g);
        try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { return { error: 'BAD_IMAGE' }; }
        return { ok: true, photo: g };
      }),
      deletePhoto: guard(async (id) => { const d = read(); d.gallery = d.gallery.filter((g) => g.id !== id); write(d); return { ok: true }; }),
    },
  };
}

export const store = SUPABASE_URL && SUPABASE_KEY ? remote() : local();
