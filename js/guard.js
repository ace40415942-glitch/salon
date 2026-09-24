// «شو رقمك؟»: دليل أرقام مشط الماكينة. الكانفس بيرسم شعر بيطلع من الجلد
// لحد طول الرقم المختار، فبيبيّن شو يعني فيد بشكل حرفي.

export const GUARDS = [
  { n: 'سكن', mm: 0, name: 'على الجلد', desc: 'بالموس أو الشيفر. هاي البداية تبع السكن فيد، ما بيضل ولا ظل.' },
  { n: '0', mm: 1, name: 'بدون مشط', desc: 'الماكينة لحالها. ظل خفيف كثير، الجلد بيبين من تحته.' },
  { n: '0.5', mm: 1.5, name: 'ظل ناعم', desc: 'أكثف شوي من الصفر. منيح لتنعيم الانتقال بأسفل الفيد.' },
  { n: '1', mm: 3, name: 'ظل واضح', desc: 'أشهر رقم للجوانب. قصير ومرتب وبيبين لون الشعر.' },
  { n: '2', mm: 6, name: 'قصير مرتب', desc: 'الجوانب مغطاية بدون ما يبين الجلد. بيناسب اللي أول مرة بيعمل فيد.' },
  { n: '3', mm: 10, name: 'طول خفيف', desc: 'بيعطي نعومة للجوانب. كثير بينطلب للقصّات الكلاسيكية.' },
  { n: '4', mm: 13, name: 'بزر كامل', desc: 'قصّة وحدة لكل الراس، سهلة وما بدها تصفيف.' },
  { n: '6', mm: 19, name: 'طول متوسط', desc: 'لفوق الراس لما بدك طول بس مرتب ومتساوي.' },
  { n: '8', mm: 25, name: 'أطول مشط', desc: '2.5 سانتي. أطول من هيك بيصير شغل مقص.' },
];

// مولّد أرقام عشوائية ثابت، حتى الشعر ما يتغير كل ما ترسم
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

export function initGuard({ onUse, reduced }) {
  const comb = document.getElementById('comb');
  const canvas = document.getElementById('fadeCanvas');
  const ctx = canvas.getContext('2d');
  let idx = 4;         // رقم 2 كبداية
  let shown = GUARDS[idx].mm;
  let target = shown;
  let raf = 0;
  let strands = [];
  let W = 0, H = 0, dpr = 1;

  comb.style.setProperty('--n', GUARDS.length);
  comb.innerHTML = GUARDS.map((g, i) => `
    <button class="tooth" type="button" role="radio" aria-checked="false" data-i="${i}"
      aria-label="رقم ${g.n}، ${g.mm} ملم"><b>${g.n}</b><small>${g.mm}</small></button>`).join('')
    + '<span class="comb-knob" aria-hidden="true"></span>';
  const knob = comb.querySelector('.comb-knob');
  const teeth = [...comb.querySelectorAll('.tooth')];

  function build() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const rand = rng(404);
    const count = Math.round(W * 1.15);
    strands = Array.from({ length: count }, () => {
      const x = rand();
      const back = rand() < 0.45;
      return { x, back, lean: (rand() - 0.5) * 0.9 + 0.18, curl: (rand() - 0.5) * 0.6, len: 0.62 + rand() * 0.5, a: back ? 0.18 + rand() * 0.25 : 0.55 + rand() * 0.45, w: back ? 0.7 + rand() * 0.5 : 0.9 + rand() * 0.9 };
    }).sort((a, b) => Number(b.back) - Number(a.back)); // الشعر الخلفي الفاتح بينرسم أول
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const base = H - 26;
    // الجلد
    const skin = ctx.createLinearGradient(0, base, 0, H);
    skin.addColorStop(0, '#6b5446'); skin.addColorStop(1, '#3b2e26');
    ctx.fillStyle = skin; ctx.fillRect(0, base, W, H - base);
    // خطوط مرجعية للطول كل 5 ملم
    const pxPerMm = (base - 18) / 26;
    ctx.font = '11px "IBM Plex Sans Arabic", sans-serif';
    ctx.textAlign = 'left';
    for (let mm = 5; mm <= 25; mm += 5) {
      const y = base - mm * pxPerMm;
      ctx.strokeStyle = 'rgba(20,17,15,.09)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(20,17,15,.45)';
      ctx.fillText(`${mm} ملم`, 8, y - 4);
    }
    // الشعر: من اليمين (جلد) لليسار (الرقم المختار)، والطول بيزيد تدريجياً = فيد
    for (const s of strands) {
      const t = 1 - s.x;                              // 0 عند اليمين، 1 عند اليسار
      const ramp = t < 0.12 ? 0 : Math.pow((t - 0.12) / 0.88, 0.85);
      const L = shown * ramp * s.len * pxPerMm;
      const x0 = s.x * W;
      if (L < 0.6) {
        if (shown > 0 && ramp > 0) { ctx.fillStyle = `rgba(20,16,13,${0.5 * s.a})`; ctx.fillRect(x0, base - 1, 1.2, 1.2); }
        continue;
      }
      const x1 = x0 - s.lean * L * 0.6, y1 = base - L;
      ctx.strokeStyle = `rgba(22,17,14,${s.a})`;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(x0, base);
      ctx.quadraticCurveTo(x0 + s.curl * L, base - L * 0.55, x1, y1);
      ctx.stroke();
      // لمعة خفيفة على بعض الشعرات
      if (s.a > 0.85 && L > 8) {
        ctx.strokeStyle = 'rgba(201,162,92,.28)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x0 + 0.6, base - L * 0.2); ctx.quadraticCurveTo(x0 + s.curl * L + 0.6, base - L * 0.6, x1 + 0.6, y1 + 1); ctx.stroke();
      }
    }
  }

  function tick() {
    shown += (target - shown) * (reduced ? 1 : 0.14);
    if (Math.abs(target - shown) < 0.02) shown = target;
    draw();
    if (shown !== target) raf = requestAnimationFrame(tick); else raf = 0;
  }

  function select(i, focus = false) {
    i = Math.max(0, Math.min(GUARDS.length - 1, i));
    const changed = i !== idx;
    idx = i;
    const g = GUARDS[i];
    teeth.forEach((b, k) => { b.setAttribute('aria-checked', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    if (focus) teeth[i].focus();
    const tr = teeth[i].getBoundingClientRect(), cr = comb.getBoundingClientRect();
    knob.style.right = `${cr.right - (tr.left + tr.width / 2)}px`;
    const num = document.getElementById('gNum');
    num.textContent = g.n;
    if (changed && !reduced) { num.classList.remove('swap'); void num.offsetWidth; num.classList.add('swap'); }
    document.getElementById('gMm').textContent = g.mm;
    document.getElementById('gName').textContent = g.name;
    document.getElementById('gDesc').textContent = g.desc;
    document.getElementById('fadeEnd').textContent = g.mm ? `رقم ${g.n}` : 'جلد';
    target = g.mm;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // سحب على المشط
  let dragging = false;
  const pick = (x) => {
    const i = teeth.findIndex((b) => { const r = b.getBoundingClientRect(); return x >= r.left && x <= r.right; });
    if (i >= 0 && i !== idx) select(i);
  };
  comb.addEventListener('pointerdown', (e) => { dragging = true; comb.setPointerCapture?.(e.pointerId); pick(e.clientX); });
  comb.addEventListener('pointermove', (e) => { if (dragging) pick(e.clientX); });
  comb.addEventListener('pointerup', () => { dragging = false; });
  comb.addEventListener('pointercancel', () => { dragging = false; });
  comb.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 }[e.key]; // RTL: اليسار = أطول
    if (k) { e.preventDefault(); select(idx + k, true); }
    if (e.key === 'Home') { e.preventDefault(); select(0, true); }
    if (e.key === 'End') { e.preventDefault(); select(GUARDS.length - 1, true); }
  });

  document.getElementById('gUse').addEventListener('click', () => onUse?.(GUARDS[idx]));

  const onResize = () => { build(); draw(); select(idx); };
  window.addEventListener('resize', onResize);
  build();

  // لما القسم يبين: الشعر بيطلع من الجلد لحد رقم 2
  shown = 0; select(idx);
  cancelAnimationFrame(raf); raf = 0; draw();
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); target = GUARDS[idx].mm; if (!raf) raf = requestAnimationFrame(tick); }
  }, { threshold: 0.35 });
  if (reduced) { shown = target; draw(); } else io.observe(canvas);
  return { select };
}
