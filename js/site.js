import { store, errText } from './store.js';
import { hydrateIcons, icon } from './icons.js';
import { initGuard } from './guard.js';
import { nowIn, addDays, dow, dayNum, monthName, fmtClock, fmtDayLong, hoursFor, buildSlots, DAY_NAMES, hm } from './time.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n)));

hydrateIcons();
$('#year').textContent = new Date().getFullYear();

// ============================================================ تقسيم العناوين لكلمات (للكشف)
function splitWords(el) {
  let i = 0;
  const wrap = (content) => {
    const w = document.createElement('span'); w.className = 'w';
    const inner = document.createElement('span'); inner.style.setProperty('--i', i++);
    inner.append(content); w.append(inner); return w;
  };
  for (const node of [...el.childNodes]) {
    if (node.nodeType === 3) {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        frag.append(/^\s+$/.test(part) ? document.createTextNode(part) : wrap(part));
      });
      node.replaceWith(frag);
    } else if (node.nodeName !== 'BR') {
      const w = wrap(node.cloneNode(true)); node.replaceWith(w);
    }
  }
}
$$('.reveal-words').forEach(splitWords);

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
const observe = (el) => (reduced ? el.classList.add('in') : io.observe(el));
$$('.reveal-words, .fade-up').forEach(observe);

// ============================================================ العمود ثلاثي الأبعاد
let pole = null;
try {
  const { createPole } = await import('./pole.js');
  pole = createPole($('#pole'));
} catch (err) {
  console.warn('WebGL pole unavailable', err);
}
if (!pole) document.body.classList.add('no-webgl');

// ============================================================ الافتتاحية
const canvas = $('#pole');
let ticking = false;
const intro = $('#intro');
let entered = false;
let introT = 0;
let introSpeed = 1;

function enter(instant = false) {
  if (entered) return;
  entered = true;
  const finish = () => {
    document.body.classList.remove('is-intro');
    document.body.classList.add('is-docked');
    if (pole) { pole.state.intro = 1; animateDock(); }
    if (!location.hash) window.scrollTo(0, 0);
    onScroll();
  };
  if (instant || reduced) {
    finish();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
    return;
  }
  const curtain = $('.curtain');
  curtain.classList.add('on');
  setTimeout(() => { finish(); requestAnimationFrame(() => curtain.classList.remove('on')); }, 600);
}

function animateDock() {
  const t0 = performance.now();
  const step = (now) => {
    const t = clamp01((now - t0) / 1400);
    pole.state.dock = t;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function runIntro() {
  let last = performance.now();
  const dur = 3.6;
  const tick = (now) => {
    if (entered) return;
    const dt = (now - last) / 1000; last = now;
    introT = Math.min(1, introT + (dt / dur) * introSpeed);
    if (pole) pole.state.intro = introT;
    if (introT > 0.58) intro.classList.add('show-mark');
    if (introT > 0.86) intro.classList.add('show-enter');
    if (introT < 1) requestAnimationFrame(tick);
  };
  setTimeout(() => requestAnimationFrame((n) => { last = n; tick(n); }), 350);
}

const deepLink = location.hash && location.hash !== '#top' && document.querySelector(location.hash);
if (deepLink || reduced) {
  intro.classList.add('show-mark', 'show-enter');
  enter(true);
} else {
  runIntro();
  $('#enter').addEventListener('click', () => enter());
  $('#skip').addEventListener('click', () => enter());
  // السكرول أو السحب خلال الافتتاحية: بيسرّع الحركة، وبعد ما يبين الاسم بيدخل
  const nudge = () => {
    if (entered) return;
    if (intro.classList.contains('show-enter')) enter();
    else introSpeed = 3.2;
  };
  window.addEventListener('wheel', nudge, { passive: true });
  window.addEventListener('touchmove', nudge, { passive: true });
  window.addEventListener('keydown', (e) => { if (['Enter', ' ', 'ArrowDown', 'PageDown'].includes(e.key)) { if (e.target === document.body) e.preventDefault(); nudge(); } });
}

// ============================================================ الحركة المرتبطة بالسكرول

function onScroll() {
  ticking = false;
  if (!entered) return;
  const vh = window.innerHeight;
  const y = window.scrollY;

  // العمود يطلع لفوق ويختفي مع نهاية الهيرو
  const heroP = clamp01(y / vh);
  const fade = 1 - clamp01((heroP - 0.18) / 0.42);
  if (pole) {
    pole.state.scroll = heroP;
    canvas.style.opacity = fade;
    if (fade <= 0.001) pole.pause(); else pole.resume();
  } else {
    const pf = $('.pole-fallback');
    pf.style.opacity = fade * 0.5;
  }
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
window.addEventListener('resize', onScroll);

// ============================================================ البيانات
let data = { settings: {}, services: [], gallery: [] };
try {
  data = await store.loadPublic();
} catch (err) {
  console.error(err);
  $('#priceList').innerHTML = `<li class="form-msg">ما قدرنا نحمّل الأسعار هلّق. حدّث الصفحة بعد شوي.</li>`;
}
const S = data.settings;
if (store.mode === 'local' && !sessionStorage.getItem('hossam-demo-hidden')) {
  $('#demoBar').hidden = false;
  $('#demoBar button').addEventListener('click', () => { $('#demoBar').hidden = true; try { sessionStorage.setItem('hossam-demo-hidden', '1'); } catch {} });
}

// ---------- الأسعار
function renderMenu() {
  const list = $('#priceList');
  if (!data.services.length) { list.innerHTML = '<li><p class="sec-sub">الأسعار رح تنزل قريباً.</p></li>'; return; }
  list.innerHTML = data.services.map((s, i) => `
    <li class="fade-up" style="--d:${i * 60}ms">
      <button class="price-row" type="button" data-svc="${esc(s.id)}">
        <span class="price-name">${esc(s.name)}</span>
        <span class="price-val"><small>₪</small>${money(s.price)}</span>
        ${s.description ? `<span class="price-desc">${esc(s.description)}</span>` : ''}
        <span class="price-meta">${icon('clock')}${s.duration_min} دقيقة</span>
        <span class="price-go">${icon('arrow-left')}</span>
      </button>
    </li>`).join('');
  $$('.fade-up', list).forEach(observe);
  $$('.price-row', list).forEach((b) => b.addEventListener('click', () => {
    selectService(b.dataset.svc);
    $('#book').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }));
}

// ---------- الحالة والدوام
function renderHours() {
  const now = nowIn(S.tz);
  const today = dow(now.day);
  const order = [6, 0, 1, 2, 3, 4, 5]; // من السبت
  $('#hoursTable').innerHTML = order.map((d) => {
    const h = S.hours?.[d];
    const off = !h || h.closed;
    return `<tr class="${d === today ? 'today' : ''} ${off ? 'off' : ''}"><td>${DAY_NAMES[d]}${d === today ? ' (اليوم)' : ''}</td>
      <td>${off ? 'مسكّر' : `${fmtClock(hm(h.open))} - ${fmtClock(hm(h.close))}`}</td></tr>`;
  }).join('');

  const st = $('#openStatus');
  const hrs = hoursFor(S, now.day);
  st.hidden = false;
  if (hrs && now.min >= hrs.open && now.min < hrs.close) {
    st.textContent = `مفتوح هلّق لحد ${fmtClock(hrs.close)}`;
  } else if (hrs && now.min < hrs.open) {
    st.textContent = `بيفتح اليوم الساعة ${fmtClock(hrs.open)}`; st.classList.add('closed');
  } else {
    st.textContent = 'مسكّر هلّق. احجز لبكرا من هون'; st.classList.add('closed');
  }
}

function waNumber(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

function renderContact() {
  if (S.tagline) $('#heroSub').textContent = `${S.tagline}. احجز دورك من هون وشوف الساعات الفاضية قبل ما تطلع من البيت.`;
  const addr = $('#visitAddr');
  if (S.address) {
    addr.hidden = false;
    const maps = S.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(S.address)}`;
    addr.innerHTML = `<a href="${esc(maps)}" target="_blank" rel="noopener">${esc(S.address)}</a>`;
  }
  const links = [];
  const wa = waNumber(S.whatsapp || S.phone);
  if (wa) links.push(['brand-whatsapp', `https://wa.me/${wa}`, 'واتساب']);
  if (S.phone) links.push(['phone', `tel:${String(S.phone).replace(/[^\d+]/g, '')}`, 'اتصل']);
  if (S.instagram) links.push(['brand-instagram', `https://instagram.com/${String(S.instagram).replace(/^@/, '')}`, 'انستغرام']);
  if (S.tiktok) links.push(['brand-tiktok', `https://www.tiktok.com/@${String(S.tiktok).replace(/^@/, '')}`, 'تيك توك']);
  if (S.address) links.push(['map-pin', S.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(S.address)}`, 'الموقع على الخريطة']);
  $('#socials').innerHTML = links.map(([ic, href, label]) =>
    `<a class="soc" href="${esc(href)}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''} aria-label="${label}" title="${label}">${icon(ic)}</a>`).join('');
}

// ---------- المعرض
function renderGallery() {
  if (!data.gallery?.length) return;
  $('#gallery').hidden = false;
  $('[data-gallery-link]').hidden = false;
  const row = $('#galleryRow');
  row.innerHTML = data.gallery.map((g) => `<figure><img src="${esc(g.image)}" alt="${esc(g.caption || 'من شغل الصالون')}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('');
  $$('figure', row).forEach(observe);
  // سحب بالماوس
  let down = false, sx = 0, sl = 0;
  row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; sl = row.scrollLeft; row.style.scrollSnapType = 'none'; });
  window.addEventListener('pointerup', () => { if (down) { down = false; row.style.scrollSnapType = ''; } });
  row.addEventListener('pointermove', (e) => { if (down) row.scrollLeft = sl - (e.clientX - sx); });
}

// ============================================================ الحجز
const B = { service: null, day: null, slot: null, busy: [], loadingBusy: false };
const horizon = Number(S.horizon_days) || 14;
let days = [];

function selectService(id) {
  const svc = data.services.find((s) => s.id === id);
  if (!svc) return;
  B.service = svc;
  $$('#svcGrid .chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.id === id)));
  $('#stepDay').disabled = false;
  setTicket('tService', svc.name);
  setTicket('tDur', `${svc.duration_min} دقيقة`);
  setTicket('tPrice', `₪${money(svc.price)}`);
  if (!B.day) {
    const first = days.find((d) => hoursFor(S, d));
    if (first) selectDay(first, false);
  } else renderSlots();
  validate();
  if (boardNext) renderBoard();
}

function renderServices() {
  $('#svcGrid').innerHTML = data.services.map((s) => `
    <button type="button" class="chip" role="radio" aria-checked="false" data-id="${esc(s.id)}">
      <b>${esc(s.name)}</b><span>₪${money(s.price)} · ${s.duration_min} دقيقة</span>
    </button>`).join('') || '<p class="slots-empty">ما في خدمات متاحة حالياً.</p>';
  $$('#svcGrid .chip').forEach((c) => c.addEventListener('click', () => selectService(c.dataset.id)));
}

function renderDays() {
  const now = nowIn(S.tz);
  days = Array.from({ length: horizon + 1 }, (_, i) => addDays(now.day, i));
  $('#dayStrip').innerHTML = days.map((d, i) => {
    const open = hoursFor(S, d);
    const label = i === 0 ? 'اليوم' : i === 1 ? 'بكرا' : DAY_NAMES[dow(d)];
    return `<button type="button" class="day" role="radio" aria-checked="false" data-day="${d}" ${open ? '' : 'disabled'}
      aria-label="${fmtDayLong(d)}${open ? '' : '، مسكّر'}"><small>${label}</small><b>${dayNum(d)}</b><span>${monthName(d)}</span></button>`;
  }).join('');
  $$('#dayStrip .day').forEach((b) => b.addEventListener('click', () => selectDay(b.dataset.day)));
  $$('.day-nav').forEach((b) => b.addEventListener('click', () => {
    const strip = $('#dayStrip');
    strip.scrollBy({ left: -Number(b.dataset.dir) * strip.clientWidth * 0.8, behavior: 'smooth' });
  }));
}

function selectDay(day, scroll = true) {
  B.day = day; B.slot = null;
  $$('#dayStrip .day').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.day === day)));
  if (scroll) $(`#dayStrip [data-day="${day}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  $('#stepTime').disabled = false;
  setTicket('tDay', fmtDayLong(day));
  setTicket('tTime', 'اختار ساعة');
  renderSlots();
  validate();
}

async function refreshBusy() {
  if (B.loadingBusy) return;
  B.loadingBusy = true;
  try {
    const now = nowIn(S.tz);
    B.busy = await store.getBusy(now.day, addDays(now.day, horizon));
  } catch (err) {
    console.error(err);
  } finally { B.loadingBusy = false; }
}

function renderSlots() {
  const box = $('#slots');
  if (!B.service || !B.day) return;
  const slots = buildSlots(S, B.day, B.service.duration_min, B.busy);
  const free = slots.filter((s) => s.state === 'free').length;
  $('#slotHint').textContent = slots.length ? `${free} وقت فاضي` : '';
  if (!slots.length) { box.innerHTML = '<p class="slots-empty">الصالون مسكّر بهاد اليوم.</p>'; return; }
  const visible = slots.filter((s) => s.state !== 'past');
  if (!visible.length) { box.innerHTML = '<p class="slots-empty">خلصت أوقات اليوم. جرّب بكرا.</p>'; return; }
  if (B.slot && !visible.some((s) => s.start === B.slot && s.state === 'free')) {
    B.slot = null; setTicket('tTime', 'اختار ساعة');
  }
  box.innerHTML = visible.map((s, i) => `
    <button type="button" class="slot" role="radio" style="--i:${i}" data-start="${s.start}"
      aria-checked="${s.start === B.slot}" ${s.state === 'taken' ? 'disabled aria-label="' + fmtClock(s.start) + '، محجوز"' : ''}>${fmtClock(s.start)}</button>`).join('');
  $$('.slot', box).forEach((b) => b.addEventListener('click', () => {
    B.slot = Number(b.dataset.start);
    $$('.slot', box).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    setTicket('tTime', `${fmtClock(B.slot)} - ${fmtClock(B.slot + B.service.duration_min)}`);
    $('#stepInfo').disabled = false;
    validate();
  }));
  if (!free) box.insertAdjacentHTML('beforeend', '<p class="slots-empty">اليوم كلّه محجوز. شوف يوم ثاني.</p>');
}

function setTicket(id, text) {
  const el = $('#' + id);
  if (el.textContent !== text) {
    el.textContent = text;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  // الشريط السفلي على الموبايل والتابلت
  $('#mbSvc').textContent = B.service ? B.service.name : 'اختار خدمة';
  $('#mbPrice').textContent = B.service ? `₪${money(B.service.price)}` : '';
  $('#mbWhen').textContent = !B.service ? 'وبعدها اليوم والساعة'
    : !B.day ? 'اختار اليوم' : B.slot == null ? `${fmtDayLong(B.day)}، اختار ساعة` : `${fmtDayLong(B.day)}، ${fmtClock(B.slot)}`;
}

function validate() {
  const ok = B.service && B.day && B.slot != null && $('#fName').value.trim().length >= 2 && $('#fPhone').value.replace(/\D/g, '').length >= 9;
  $('#confirmBtn').disabled = !ok;
  $('#mbConfirm').disabled = !ok;
  return ok;
}
['#fName', '#fPhone'].forEach((s) => $(s).addEventListener('input', validate));

const msg = (text, ok = false) => { const m = $('#formMsg'); m.textContent = text || ''; m.classList.toggle('ok', ok); };

$('#bookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;
  const btns = [$('#confirmBtn'), $('#mbConfirm')];
  const labels = btns.map((b) => b.querySelector('span').textContent);
  btns.forEach((b) => { b.disabled = true; b.querySelector('span').textContent = 'لحظة...'; });
  msg('');
  const res = await store.createBooking({
    service_id: B.service.id, day: B.day, start_min: B.slot,
    name: $('#fName').value, phone: $('#fPhone').value, note: $('#fNote').value,
  });
  btns.forEach((b, i) => { b.querySelector('span').textContent = labels[i]; });
  if (!res?.ok) {
    msg(errText(res?.error));
    if (window.innerWidth <= 960) $('#formMsg').scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    if (res?.error === 'SLOT_TAKEN' || res?.error === 'TOO_LATE') {
      await refreshBusy(); B.slot = null; renderSlots(); setTicket('tTime', 'اختار ساعة');
    }
    validate();
    return;
  }
  const bk = res.booking;
  try { localStorage.setItem('hossam-last-booking', JSON.stringify({ ...bk, phone: $('#fPhone').value })); } catch {}
  $('#ticketNo').textContent = bk.code;
  const stamp = $('#stamp');
  stamp.classList.remove('on'); void stamp.offsetWidth; stamp.classList.add('on');
  await refreshBusy();
  renderBoard();
  const ticketShown = $('#ticket').offsetParent !== null;
  setTimeout(() => showDone(bk), reduced || !ticketShown ? 0 : 900);
});

function showDone(bk) {
  $('#doneTitle').textContent = bk.service_name;
  $('#doneWhen').textContent = `${fmtDayLong(bk.day)}، الساعة ${fmtClock(bk.start_min)}`;
  $('#doneCode').textContent = bk.code;
  const wa = waNumber(S.whatsapp || S.phone);
  const text = `مرحبا، حجزت دور بصالون حسام\nالخدمة: ${bk.service_name}\nاليوم: ${fmtDayLong(bk.day)}\nالساعة: ${fmtClock(bk.start_min)}\nالاسم: ${bk.customer_name}\nكود الحجز: ${bk.code}`;
  const waBtn = $('#doneWa');
  waBtn.hidden = !wa;
  if (wa) waBtn.href = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  $('#doneIcs').onclick = () => downloadIcs(bk);
  const dlg = $('#doneDlg');
  dlg.showModal?.() ?? dlg.setAttribute('open', '');
}
$('#doneClose').addEventListener('click', resetBooking);
$('#doneDlg').addEventListener('cancel', resetBooking);
$('#copyCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#doneCode').textContent); $('#copyCode').innerHTML = icon('check'); } catch {}
});

function resetBooking() {
  const dlg = $('#doneDlg');
  if (dlg.open) dlg.close?.();
  dlg.removeAttribute('open');
  B.slot = null; $('#fNote').value = '';
  $('#stamp').classList.remove('on');
  $('#ticketNo').textContent = 'دورك';
  $('#copyCode').innerHTML = icon('copy');
  setTicket('tTime', 'اختار ساعة');
  msg('');
  renderSlots(); validate(); renderBoard();
}

function downloadIcs(bk) {
  const p = (n) => String(n).padStart(2, '0');
  const dt = (min) => `${bk.day.replace(/-/g, '')}T${p(Math.floor(min / 60))}${p(min % 60)}00`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hossam Barber//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${bk.code}@hossam-barber`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=${S.tz || 'Asia/Jerusalem'}:${dt(bk.start_min)}`, `DTEND;TZID=${S.tz || 'Asia/Jerusalem'}:${dt(bk.end_min)}`,
    `SUMMARY:صالون حسام - ${bk.service_name}`, `DESCRIPTION:كود الحجز ${bk.code}`,
    S.address ? `LOCATION:${S.address}` : '', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:دورك بصالون حسام بعد ساعة', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `hossam-${bk.code}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- إلغاء
$('#cancelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('#cancelMsg');
  const res = await store.cancelBooking($('#cCode').value, $('#cPhone').value);
  m.classList.toggle('ok', !!res?.ok);
  m.textContent = res?.ok ? 'انلغى الحجز. الوقت صار متاح لغيرك.' : errText(res?.error);
  if (res?.ok) { await refreshBusy(); renderSlots(); }
});
try {
  const last = JSON.parse(localStorage.getItem('hossam-last-booking'));
  if (last?.code) { $('#cCode').value = last.code; $('#cPhone').value = last.phone || ''; }
} catch {}

// ============================================================ أقرب دور فاضي (لوحة قلّابة)
function nextFree(svc) {
  const now = nowIn(S.tz);
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(now.day, i);
    const s = buildSlots(S, d, svc.duration_min, B.busy).find((x) => x.state === 'free');
    if (s) return { day: d, start: s.start, offset: i };
  }
  return null;
}

let boardNext = null;
let flapTimers = [];
function setFlaps(text) {
  const box = $('#flaps');
  const chars = [...text];
  if (box.children.length !== chars.length) {
    box.innerHTML = chars.map((c) => `<span class="flap${c === ':' ? ' sep' : ''}">${c === ':' ? ':' : ' '}</span>`).join('');
  }
  flapTimers.forEach(clearInterval); flapTimers = [];
  [...box.children].forEach((el, i) => {
    const want = chars[i];
    if (want === ':' || want === ' ' || reduced) { el.textContent = want; return; }
    let n = 6 + i * 3;
    const t = setInterval(() => {
      el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
      el.textContent = n <= 0 ? want : String(Math.floor(Math.random() * 10));
      if (n-- <= 0) clearInterval(t);
    }, 70);
    flapTimers.push(t);
  });
}

function renderBoard() {
  const svc = B.service || [...data.services].sort((a, b) => a.duration_min - b.duration_min)[0];
  const take = $('#boardTake');
  if (!svc) { $('#boardDay').textContent = 'ما في خدمات متاحة حالياً.'; take.disabled = true; return; }
  $('#boardFor').textContent = `لـ${svc.name}`;
  const nx = nextFree(svc);
  const key = nx ? `${svc.id}|${nx.day}|${nx.start}` : `${svc.id}|none`;
  if (key === boardNext) return;
  boardNext = key;
  if (!nx) {
    setFlaps('--:--'); $('#boardAp').textContent = '';
    $('#boardDay').textContent = 'ما في أوقات فاضية بالأيام الجاية.'; take.disabled = true; return;
  }
  const h = Math.floor(nx.start / 60), m = nx.start % 60, h12 = ((h + 11) % 12) + 1;
  setFlaps(`${String(h12).padStart(2, ' ')}:${String(m).padStart(2, '0')}`);
  $('#boardAp').textContent = h < 12 ? 'ص' : 'م';
  $('#boardDay').textContent = nx.offset === 0 ? 'اليوم' : nx.offset === 1 ? `بكرا، ${fmtDayLong(nx.day)}` : fmtDayLong(nx.day);
  take.disabled = false;
  take.onclick = () => {
    if (!B.service) selectService(svc.id);
    selectDay(nx.day);
    const b = $(`#slots .slot[data-start="${nx.start}"]`);
    b?.click();
    $('#stepInfo').scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    setTimeout(() => $('#fName').focus({ preventScroll: true }), reduced ? 0 : 500);
  };
}

// ============================================================ تشغيل
renderMenu();
renderHours();
renderContact();
renderGallery();
renderServices();
renderDays();
await refreshBusy();
if (B.service) renderSlots();
setTicket('tService', $('#tService').textContent);

// الحجز من دليل الأرقام: بيكتب الرقم بالملاحظة
initGuard({
  reduced,
  onUse(g) {
    $('#fNote').value = g.mm ? `الجوانب على رقم ${g.n} (${g.mm} ملم)` : 'الجوانب سكن (على الجلد)';
    $('#book').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  },
});

// اللوحة القلّابة بتشتغل أول ما توصلها
new IntersectionObserver((es, o) => {
  if (es.some((e) => e.isIntersecting)) { o.disconnect(); renderBoard(); }
}, { threshold: 0.4 }).observe($('#board'));

// الشريط السفلي بيظهر بس وإنت بقسم الحجز
new IntersectionObserver((es) => {
  for (const e of es) document.body.classList.toggle('mbar-on', e.isIntersecting);
}, { rootMargin: '-35% 0px -35% 0px' }).observe($('#bookForm'));

// تحديث الأوقات المحجوزة كل 30 ثانية ولما يرجع الزبون للصفحة
const syncBusy = async () => { await refreshBusy(); renderSlots(); if (boardNext) renderBoard(); };
setInterval(() => { if (!document.hidden && B.day) syncBusy(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && B.day) syncBusy(); });
onScroll();
