import { store, errText, DEFAULT_SETTINGS } from './store.js';
import { hydrateIcons, icon } from './icons.js';
import { nowIn, addDays, fmtClock, fmtDayLong, hoursFor, hm, fmtMin, DAY_NAMES } from './time.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `₪${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

hydrateIcons();

let PIN = sessionStorage.getItem('hossam-pin') || '';
let S = { ...DEFAULT_SETTINGS };
let services = [];
let bookings = [];
let day = null;

function toast(text, err = false) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : ''); t.textContent = text; t.setAttribute('role', 'status');
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

async function call(fn, ...args) {
  const res = await store.admin[fn](PIN, ...args);
  if (res?.error === 'BAD_PIN') { logout(); toast(errText('BAD_PIN'), true); }
  return res || { error: 'NETWORK' };
}

// ============================================================ الدخول
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = $('#pin').value.trim();
  const res = await store.admin.checkPin(pin);
  if (!res?.ok) { $('#loginMsg').textContent = errText(res?.error); return; }
  PIN = pin; sessionStorage.setItem('hossam-pin', pin);
  boot();
});

function logout() {
  PIN = ''; sessionStorage.removeItem('hossam-pin');
  $('#app').hidden = true; $('#login').hidden = false; $('#pin').value = '';
}
$('#logout').addEventListener('click', logout);

// ============================================================ التبويبات
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  location.hash = b.dataset.tab;
}));

// ============================================================ تحميل
async function boot() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#demoNote').hidden = store.mode !== 'local';
  const pub = await store.loadPublic().catch(() => null);
  if (pub) S = { ...DEFAULT_SETTINGS, ...pub.settings };
  const sv = await call('listServices');
  if (!sv.ok) return;
  services = sv.services;
  day = day || nowIn(S.tz).day;
  await loadBookings();
  renderServices(); renderHours(); renderSettings(); renderPhotos(pub?.gallery || []);
  const tab = location.hash.slice(1);
  if (tab) $(`.tabs [data-tab="${tab}"]`)?.click();
}

async function loadBookings() {
  const today = nowIn(S.tz).day;
  const from = [addDays(today, -31), day].sort()[0];
  const to = [addDays(today, Number(S.horizon_days) + 1), day].sort()[1];
  const res = await call('listBookings', from, to);
  if (!res.ok) return;
  bookings = res.bookings;
  renderStats(); renderAgenda();
}

// ============================================================ الحجوزات
const counts = (b) => b.status === 'confirmed' || b.status === 'done';

function renderStats() {
  const now = nowIn(S.tz);
  const todays = bookings.filter((b) => b.day === now.day && counts(b));
  const next = todays.filter((b) => b.status === 'confirmed' && b.end_min > now.min).sort((a, b) => a.start_min - b.start_min)[0];
  const week = bookings.filter((b) => b.day > addDays(now.day, -7) && b.day <= now.day && counts(b));
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && (b.day > now.day || (b.day === now.day && b.start_min >= now.min)));
  $('#stats').innerHTML = `
    <div class="stat"><small>الدور الجاي</small><b>${next ? `${fmtClock(next.start_min)}` : 'ما في'}</b>${next ? `<span>${esc(next.customer_name)} · ${esc(next.service_name)}</span>` : ''}</div>
    <div class="stat"><small>اليوم</small><b>${todays.length}</b><span>${money(todays.reduce((s, b) => s + Number(b.price), 0))}</span></div>
    <div class="stat"><small>آخر 7 أيام</small><b>${money(week.reduce((s, b) => s + Number(b.price), 0))}</b><span>${upcoming.length} حجز جاي</span></div>`;
}

const STATUS = { confirmed: 'محجوز', done: 'تم', no_show: 'ما إجا', cancelled: 'ملغي', blocked: 'مسكّر' };

function waLink(phone, b) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '972' + d.slice(1);
  const text = `مرحبا ${b.customer_name}، تذكير بدورك بصالون حسام ${fmtDayLong(b.day)} الساعة ${fmtClock(b.start_min)}. كود الحجز ${b.code}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

function renderAgenda() {
  $('#dayTitle').textContent = fmtDayLong(day);
  $('#dayPick').value = day;
  const list = bookings.filter((b) => b.day === day).sort((a, b) => a.start_min - b.start_min);
  const hrs = hoursFor(S, day);
  const items = [];
  // الفجوات الفاضية بين الحجوزات
  if (hrs) {
    let cursor = hrs.open;
    const active = list.filter((b) => b.status !== 'cancelled');
    for (const b of active) {
      if (b.start_min - cursor >= 15) items.push({ gap: true, start_min: cursor, end_min: b.start_min });
      cursor = Math.max(cursor, b.end_min);
    }
    if (hrs.close - cursor >= 15) items.push({ gap: true, start_min: cursor, end_min: hrs.close });
  }
  items.push(...list);
  items.sort((a, b) => a.start_min - b.start_min || (a.gap ? 1 : -1));

  if (!items.length) {
    $('#agenda').innerHTML = `<li class="empty">${hrs ? 'ما في حجوزات بهاد اليوم.' : 'الصالون مسكّر بهاد اليوم.'}</li>`;
    return;
  }
  $('#agenda').innerHTML = items.map((b) => {
    if (b.gap) return `<li class="ag gap"><div class="ag-time">${fmtClock(b.start_min)}</div><div>فاضي لحد ${fmtClock(b.end_min)}</div></li>`;
    const wa = waLink(b.phone, b);
    const who = b.status === 'blocked'
      ? `<b>وقت مسكّر</b>${b.note ? `<div>${esc(b.note)}</div>` : ''}`
      : `<b>${esc(b.customer_name) || 'بدون اسم'}</b><span class="tag">${STATUS[b.status]}</span>
         <div>${esc(b.service_name)}${Number(b.price) ? ` · ${money(b.price)}` : ''}${b.phone ? ` · <span dir="ltr">${esc(b.phone)}</span>` : ''} · ${esc(b.code)}</div>
         ${b.note ? `<div>«${esc(b.note)}»</div>` : ''}`;
    const act = [];
    if (b.status === 'confirmed') {
      act.push(`<button class="icon-btn ok" data-act="done" title="تم" aria-label="تم">${icon('check')}</button>`);
      act.push(`<button class="icon-btn" data-act="no_show" title="ما إجا" aria-label="ما إجا">${icon('user')}</button>`);
      act.push(`<button class="icon-btn bad" data-act="cancelled" title="إلغاء" aria-label="إلغاء">${icon('ban')}</button>`);
    }
    if (b.status === 'done' || b.status === 'no_show' || b.status === 'cancelled') {
      act.push(`<button class="icon-btn" data-act="confirmed" title="رجّعه محجوز" aria-label="رجّعه محجوز">${icon('refresh')}</button>`);
    }
    if (wa && b.status !== 'blocked') act.push(`<a class="icon-btn" href="${wa}" target="_blank" rel="noopener" title="واتساب" aria-label="واتساب">${icon('brand-whatsapp')}</a>`);
    if (b.phone && b.status !== 'blocked') act.push(`<a class="icon-btn" href="tel:${esc(b.phone)}" title="اتصال" aria-label="اتصال">${icon('phone')}</a>`);
    if (b.status === 'blocked' || b.status === 'cancelled') act.push(`<button class="icon-btn bad" data-act="delete" title="حذف" aria-label="حذف">${icon('trash')}</button>`);
    return `<li class="ag ${b.status}" data-id="${esc(b.id)}">
      <div class="ag-time">${fmtClock(b.start_min)}<small>لحد ${fmtClock(b.end_min)}</small></div>
      <div class="ag-who">${who}</div>
      <div class="ag-actions">${act.join('')}</div></li>`;
  }).join('');
}

$('#agenda').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const act = btn.dataset.act;
  if (act === 'cancelled' && !confirm('أكيد بدك تلغي هاد الحجز؟')) return;
  if (act === 'delete' && !confirm('حذف نهائي؟')) return;
  const res = act === 'delete' ? await call('deleteBooking', id) : await call('setStatus', id, act);
  if (!res.ok) { toast(errText(res.error), true); return; }
  await loadBookings();
});

const goDay = async (d) => { day = d; await loadBookings(); };
$('#prevDay').addEventListener('click', () => goDay(addDays(day, -1)));
$('#nextDay').addEventListener('click', () => goDay(addDays(day, 1)));
$('#todayBtn').addEventListener('click', () => goDay(nowIn(S.tz).day));
$('#dayPick').addEventListener('change', (e) => e.target.value && goDay(e.target.value));

// ---------- حجز يدوي / تسكير وقت
const dlg = $('#bkDlg');
function kind() { return $('input[name="kind"]:checked', dlg).value; }
$$('input[name="kind"]', dlg).forEach((r) => r.addEventListener('change', () => dlg.classList.toggle('is-blocked', kind() === 'blocked')));
$('#bkSvc').addEventListener('change', () => {
  const s = services.find((x) => x.id === $('#bkSvc').value);
  if (s && $('#bkFrom').value) $('#bkTo').value = fmtMin(hm($('#bkFrom').value) + s.duration_min);
});
$('#bkFrom').addEventListener('change', () => $('#bkSvc').dispatchEvent(new Event('change')));

$('#addBookingBtn').addEventListener('click', () => {
  $('#bkSvc').innerHTML = services.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.duration_min} د)</option>`).join('');
  $('input[name="kind"][value="confirmed"]', dlg).checked = true;
  dlg.classList.remove('is-blocked');
  $('#bkDay').value = day;
  const hrs = hoursFor(S, day);
  $('#bkFrom').value = fmtMin(hrs ? hrs.open : 600);
  $('#bkSvc').dispatchEvent(new Event('change'));
  ['#bkName', '#bkPhone', '#bkNote'].forEach((s) => { $(s).value = ''; });
  $('#bkMsg').textContent = '';
  dlg.showModal();
});

$('#bkForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const start = hm($('#bkFrom').value), end = hm($('#bkTo').value);
  if (!$('#bkDay').value || !(end > start)) { $('#bkMsg').textContent = 'الوقت مش مزبوط.'; return; }
  const k = kind();
  const res = await call('addBooking', {
    day: $('#bkDay').value, start_min: start, end_min: end, status: k,
    service_id: k === 'confirmed' ? $('#bkSvc').value : null,
    customer_name: k === 'confirmed' ? $('#bkName').value.trim() : '',
    phone: k === 'confirmed' ? $('#bkPhone').value : '', note: $('#bkNote').value.trim(),
  });
  if (!res.ok) { $('#bkMsg').textContent = errText(res.error); return; }
  dlg.close();
  day = $('#bkDay').value;
  await loadBookings();
  toast(k === 'blocked' ? 'انسكّر الوقت' : 'انضاف الحجز');
});

// ============================================================ الخدمات والأسعار
function renderServices() {
  $('#svcList').innerHTML = services.map((s) => `
    <div class="svc-row ${s.active ? '' : 'off'}" data-id="${esc(s.id || '')}">
      <label class="field"><span>الاسم</span><input data-f="name" value="${esc(s.name)}" maxlength="60"></label>
      <label class="field"><span>وصف قصير</span><input data-f="description" value="${esc(s.description)}" maxlength="160"></label>
      <label class="field price-in"><span>السعر</span><input data-f="price" type="number" min="0" step="1" inputmode="decimal" dir="ltr" value="${esc(s.price)}"></label>
      <label class="field"><span>المدّة (د)</span><input data-f="duration_min" type="number" min="10" max="240" step="5" dir="ltr" value="${esc(s.duration_min)}"></label>
      <div class="svc-row-actions">
        <label class="switch"><input type="checkbox" data-f="active" ${s.active ? 'checked' : ''}>ظاهر</label>
        <button class="icon-btn" data-svc="save" title="احفظ" aria-label="احفظ">${icon('check')}</button>
        <button class="icon-btn" data-svc="del" title="حذف" aria-label="حذف">${icon('trash')}</button>
      </div>
    </div>`).join('') || '<p class="empty">ما في خدمات. ضيف أول خدمة.</p>';
}

$('#addService').addEventListener('click', () => {
  services.push({ id: '', name: '', description: '', price: '', duration_min: 30, active: true });
  renderServices();
  $('#svcList .svc-row:last-child [data-f="name"]').focus();
});

$('#svcList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-svc]');
  if (!btn) return;
  const row = btn.closest('.svc-row');
  const id = row.dataset.id;
  if (btn.dataset.svc === 'del') {
    if (!id) { services = services.filter((s) => s.id); renderServices(); return; }
    if (!confirm('حذف الخدمة؟ الحجوزات القديمة بتضل محفوظة.')) return;
    const res = await call('deleteService', id);
    if (!res.ok) return toast(errText(res.error), true);
    services = services.filter((s) => s.id !== id); renderServices(); toast('انحذفت');
    return;
  }
  const v = (f) => $(`[data-f="${f}"]`, row);
  const p = {
    id, name: v('name').value.trim(), description: v('description').value.trim(),
    price: Number(v('price').value), duration_min: Number(v('duration_min').value), active: v('active').checked,
  };
  if (p.name.length < 2 || !(p.price >= 0) || v('price').value === '' || !(p.duration_min >= 10)) return toast('عبّي الاسم والسعر والمدّة (10 دقائق على الأقل)', true);
  const res = await call('saveService', p);
  if (!res.ok) return toast(errText(res.error), true);
  const i = services.findIndex((s) => s.id === id);
  services[i] = res.service;
  renderServices(); toast('انحفظ');
});

// ============================================================ الدوام
function renderHours() {
  const order = [6, 0, 1, 2, 3, 4, 5];
  $('#hoursEdit').innerHTML = order.map((d) => {
    const h = S.hours?.[d] || { open: '10:00', close: '20:00', closed: true };
    return `<div class="h-row ${h.closed ? 'closed' : ''}" data-d="${d}">
      <b>${DAY_NAMES[d]}</b>
      <input type="time" data-h="open" value="${esc(h.open)}" step="900" aria-label="بيفتح">
      <input type="time" data-h="close" value="${esc(h.close)}" step="900" aria-label="بيسكّر">
      <label class="switch"><input type="checkbox" data-h="closed" ${h.closed ? 'checked' : ''}>مسكّر</label>
    </div>`;
  }).join('');
  $$('#hoursEdit [data-h="closed"]').forEach((c) => c.addEventListener('change', () => c.closest('.h-row').classList.toggle('closed', c.checked)));
  $('#slotStep').value = String(S.slot_step);
  $('#horizon').value = S.horizon_days;
  $('#notice').value = S.min_notice_min;
  renderDaysOff();
}

let daysOff = [];
function renderDaysOff() {
  daysOff = [...(S.days_off || [])].sort();
  $('#daysOff').innerHTML = daysOff.map((d) => `<li>${fmtDayLong(d)} <button data-off="${d}" aria-label="شيل">${icon('x')}</button></li>`).join('');
}
$('#addOff').addEventListener('click', () => {
  const d = $('#offDate').value;
  if (!d || daysOff.includes(d)) return;
  S.days_off = [...daysOff, d]; renderDaysOff();
  $('#hoursMsg').textContent = 'اضغط «احفظ» فوق حتى ينحفظ.';
});
$('#daysOff').addEventListener('click', (e) => {
  const b = e.target.closest('[data-off]'); if (!b) return;
  S.days_off = daysOff.filter((d) => d !== b.dataset.off); renderDaysOff();
  $('#hoursMsg').textContent = 'اضغط «احفظ» فوق حتى ينحفظ.';
});

$('#saveHours').addEventListener('click', async () => {
  const hours = {};
  for (const row of $$('#hoursEdit .h-row')) {
    const open = $('[data-h="open"]', row).value, close = $('[data-h="close"]', row).value;
    const closed = $('[data-h="closed"]', row).checked;
    if (!closed && !(hm(close) > hm(open))) { toast(`ساعات ${$('b', row).textContent} مش مزبوطة`, true); return; }
    hours[row.dataset.d] = { open, close, closed };
  }
  const p = {
    hours, days_off: daysOff,
    slot_step: Number($('#slotStep').value),
    horizon_days: Math.min(60, Math.max(1, Number($('#horizon').value) || 14)),
    min_notice_min: Math.max(0, Number($('#notice').value) || 0),
  };
  const res = await call('saveSettings', p);
  if (!res.ok) return toast(errText(res.error), true);
  S = { ...S, ...res.settings }; $('#hoursMsg').textContent = '';
  renderAgenda(); toast('انحفظ الدوام');
});

// ============================================================ الإعدادات
function renderSettings() {
  $$('#settingsForm [data-k]').forEach((i) => { i.value = S[i.dataset.k] ?? ''; });
}
$('#saveSettings').addEventListener('click', async () => {
  const p = {};
  $$('#settingsForm [data-k]').forEach((i) => { p[i.dataset.k] = i.type === 'number' ? Number(i.value) || 2 : i.value.trim(); });
  const res = await call('saveSettings', p);
  if (!res.ok) return toast(errText(res.error), true);
  S = { ...S, ...res.settings }; toast('انحفظت المعلومات');
});

$('#pinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = $('#newPin').value, b = $('#newPin2').value;
  const m = $('#pinMsg');
  if (a !== b) { m.textContent = 'الرمزين مش متطابقين.'; return; }
  const res = await call('changePin', a);
  if (!res.ok) { m.textContent = errText(res.error); return; }
  PIN = a; sessionStorage.setItem('hossam-pin', a);
  $('#newPin').value = $('#newPin2').value = '';
  m.textContent = ''; toast('تغيّر الرمز');
});

// ============================================================ الصور
function renderPhotos(list) {
  $('#photoGrid').innerHTML = list.map((g) => `
    <figure data-id="${esc(g.id)}"><img src="${esc(g.image)}" alt="${esc(g.caption)}" loading="lazy">
      ${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}
      <button class="icon-btn" data-del aria-label="حذف">${icon('trash')}</button></figure>`).join('')
    || '<p class="empty" style="grid-column:1/-1">ما في صور لسا.</p>';
}

async function compress(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('decode');
  let max = 1200, q = 0.8, out = '';
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (out.length < 600000) return out;
    max *= 0.82; q -= 0.06;
  }
  return out;
}

$('#photoInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  const m = $('#photoMsg');
  for (const [i, f] of files.entries()) {
    m.textContent = `عم برفع ${i + 1} من ${files.length}...`;
    try {
      const img = await compress(f);
      const caption = files.length === 1 ? (prompt('وصف قصير للصورة (اختياري):') || '') : '';
      const res = await call('addPhoto', img, caption);
      if (!res.ok) { toast(errText(res.error), true); break; }
    } catch { toast('ما قدرنا نقرأ الصورة', true); }
  }
  m.textContent = '';
  e.target.value = '';
  const pub = await store.loadPublic(); renderPhotos(pub.gallery);
});

$('#photoGrid').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  if (!confirm('حذف الصورة؟')) return;
  const res = await call('deletePhoto', b.closest('figure').dataset.id);
  if (!res.ok) return toast(errText(res.error), true);
  b.closest('figure').remove(); toast('انحذفت');
});

// ============================================================ تشغيل
if (PIN) {
  const r = await store.admin.checkPin(PIN);
  if (r?.ok) boot(); else logout();
}
// تحديث تلقائي للحجوزات كل 20 ثانية
setInterval(() => { if (PIN && !document.hidden && !$('#app').hidden && !dlg.open) loadBookings(); }, 20000);
