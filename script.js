/* =====================================================================
 * script.js — Logika utama Ular Tangga Matematika
 * Bergantung pada: questions.js (objek global MathQuestions)
 * ===================================================================== */

/* ---------- Konfigurasi papan ---------- */
const SNAKES  = { 17: 7, 38: 1, 47: 26, 49: 11, 62: 21, 74: 56, 93: 73, 95: 76, 97: 24 };
const LADDERS = { 9: 33, 25: 96, 39: 63, 51: 67, 71: 92, 80: 98 };

const BOT_ACCURACY = 0.6;
const STEP_DELAY   = 480;   // ms per langkah pion
const HOP_DURATION = 440;   // ms lama satu loncatan
const JUMP_DELAY   = 1300;  // ms animasi naik tangga / turun ular
const ROLL_TIME    = 960;   // ms lama dadu berputar

const DICE_PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8],
  4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const LOG_ICON = { roll: '🎲', ladder: '🪜', snake: '🐍', safe: '🛡️', fail: '❌', warn: '⚠️', win: '🏆', info: '✨' };

const state = { players: [], current: 0, busy: false, over: false };
let lastShownTurn = -1;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 0. SUARA (Web Audio, tanpa berkas audio) ---------- */

let audioCtx = null;
let muted = false;

function ac() {
  if (!audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) audioCtx = new C();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur, { type = 'sine', vol = 0.15, start = 0, slideTo = null } = {}) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Letupan derau singkat berfilter (bunyi "tak" benda keras). freq = pusat frekuensi filter. */
function click(vol = 0.25, dur = 0.05, start = 0, freq = null) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.value = freq || (1800 + Math.random() * 1800);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const sfx = {
  hop(step) {
    const f = 300 + (step % 6) * 35;
    tone(f, 0.16, { type: 'triangle', vol: 0.16, slideTo: f * 1.7 });
    tone(f * 0.5, 0.08, { type: 'sine', vol: 0.1, start: 0.2 });
  },
  /**
   * Suara dadu berputar/menggelinding: rentetan ketukan keras-kayu yang tak beraturan,
   * makin lama makin renggang dan pelan, diselingi bunyi "tuk" rendah saat dadu memantul.
   */
  diceRoll(total = 0.95) {
    let t = 0, gap = 0.03;
    while (t < total) {
      const fade = 1 - (t / total) * 0.55;
      click(0.4 * fade, 0.02 + Math.random() * 0.02, t, 1200 + Math.random() * 3000);
      if (Math.random() < 0.4) {
        const f = 120 + Math.random() * 90;
        tone(f, 0.07, { type: 'sine', vol: 0.16 * fade, start: t, slideTo: f * 0.55 });
      }
      t += gap * (0.6 + Math.random() * 0.8);
      gap *= 1.07;
    }
  },
  diceLand() {
    tone(200, 0.16, { type: 'sine', vol: 0.22, slideTo: 90 });
    click(0.4, 0.04, 0, 2200);
  },
  ladder() {
    [523, 587, 659, 784, 880, 1047, 1319].forEach((f, i) =>
      tone(f, 0.18, { type: 'square', vol: 0.09, start: i * 0.13 }));
    tone(1568, 0.4, { type: 'sine', vol: 0.12, start: 0.95 });
  },
  snake() {
    tone(800, 1.1, { type: 'sawtooth', vol: 0.11, slideTo: 70 });
    tone(620, 1.1, { type: 'square', vol: 0.05, slideTo: 55, start: 0.05 });
    for (let i = 0; i < 8; i++) click(0.08, 0.12, i * 0.13);
  },
  correct() {
    tone(660, 0.15, { type: 'sine', vol: 0.18 });
    tone(990, 0.3, { type: 'sine', vol: 0.18, start: 0.14 });
  },
  wrong() {
    tone(220, 0.3, { type: 'sawtooth', vol: 0.12, slideTo: 140 });
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.22, { type: 'triangle', vol: 0.16, start: i * 0.14 }));
  },
};

/* ---------- 1. GEOMETRI PAPAN ---------- */

function numberToGrid(n) {
  const idx = n - 1;
  const boardRow = Math.floor(idx / 10);
  const offset = idx % 10;
  const col = boardRow % 2 === 0 ? offset : 9 - offset;
  return { boardRow, col };
}

function cellCenter(n) {
  const { boardRow, col } = numberToGrid(n);
  return { x: col * 10 + 5, y: (9 - boardRow) * 10 + 5 };
}

function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  for (let displayRow = 0; displayRow < 10; displayRow++) {
    const boardRow = 9 - displayRow;
    for (let col = 0; col < 10; col++) {
      const number = boardRow * 10 + (boardRow % 2 === 0 ? col + 1 : 10 - col);
      const cell = document.createElement('div');
      cell.className = 'cell' + ((boardRow + col) % 2 ? ' alt' : '');
      cell.id = 'cell-' + number;
      if (LADDERS[number]) cell.classList.add('ladder');
      if (SNAKES[number])  cell.classList.add('snake');
      if (number === 100)  cell.classList.add('finish');
      cell.innerHTML = `<span class="num">${number}</span>` + (number === 100 ? '<span class="flag">🏁</span>' : '');
      board.appendChild(cell);
    }
  }
  gambarDekorasi();
}

/* ---------- 2. MENGGAMBAR ULAR & TANGGA (SVG) ---------- */

function garis(x1, y1, x2, y2, stroke, width, extra = '') {
  return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" ` +
         `stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
}

/** Tangga HIJAU dari petak `dari` ke petak `ke`. */
function gambarTangga(dari, ke) {
  const a = cellCenter(dari), b = cellCenter(ke);
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const px = -uy, py = ux;
  const lebar = 1.8;
  const sx = a.x + ux * 1.5, sy = a.y + uy * 1.5;
  const ex = b.x - ux * 1.5, ey = b.y - uy * 1.5;
  const panjang = L - 3;
  let svg = '';

  for (const s of [-1, 1]) {
    const x1 = sx + px * lebar * s, y1 = sy + py * lebar * s;
    const x2 = ex + px * lebar * s, y2 = ey + py * lebar * s;
    svg += garis(x1, y1, x2, y2, '#14532d', 1.4);
    svg += garis(x1, y1, x2, y2, '#16a34a', 0.9);
  }
  const jumlah = Math.max(2, Math.floor(panjang / 4));
  for (let i = 0; i < jumlah; i++) {
    const t = (i + 0.5) / jumlah;
    const cx = sx + (ex - sx) * t, cy = sy + (ey - sy) * t;
    const x1 = cx + px * lebar, y1 = cy + py * lebar;
    const x2 = cx - px * lebar, y2 = cy - py * lebar;
    svg += garis(x1, y1, x2, y2, '#14532d', 1.1);
    svg += garis(x1, y1, x2, y2, '#86efac', 0.65);
  }
  return svg;
}

/** Ular MERAH dari kepala ke ekor. */
function gambarUlar(kepala, ekor) {
  const h = cellCenter(kepala), t = cellCenter(ekor);
  const dx = t.x - h.x, dy = t.y - h.y;
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const px = -uy, py = ux;
  const gelombang = Math.max(2, Math.round(L / 10));
  const amplitudo = 2.4, N = 48;

  const pts = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const peredam = Math.min(1, s * 6);
    const off = amplitudo * peredam * Math.sin(s * gelombang * 2 * Math.PI);
    pts.push({ x: h.x + dx * s + px * off, y: h.y + dy * s + py * off, w: 2.8 - 1.9 * s });
  }

  let svg = '';
  for (let i = 0; i < N; i++) {
    svg += garis(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, '#7f1d1d', (pts[i].w + 0.7).toFixed(2));
  }
  for (let i = 0; i < N; i++) {
    svg += garis(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, '#ef2b2b', pts[i].w.toFixed(2));
  }
  const poly = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  svg += `<polyline points="${poly}" fill="none" stroke="#fecaca" stroke-width="0.45" ` +
         `stroke-dasharray="0.9 1.7" stroke-linecap="butt" stroke-linejoin="round" opacity="0.85"/>`;

  let hx = pts[0].x - pts[2].x, hy = pts[0].y - pts[2].y;
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl; hy /= hl;
  const gx = -hy, gy = hx;

  const lx = h.x + hx * 2.0, ly = h.y + hy * 2.0;
  const tx = h.x + hx * 3.6, ty = h.y + hy * 3.6;
  svg += garis(lx, ly, tx, ty, '#450a0a', 0.35);
  svg += garis(tx, ty, tx + hx * 0.9 + gx * 0.7, ty + hy * 0.9 + gy * 0.7, '#450a0a', 0.3);
  svg += garis(tx, ty, tx + hx * 0.9 - gx * 0.7, ty + hy * 0.9 - gy * 0.7, '#450a0a', 0.3);

  svg += `<circle cx="${h.x}" cy="${h.y}" r="2.3" fill="#dc2626" stroke="#7f1d1d" stroke-width="0.5"/>`;
  for (const s of [-1, 1]) {
    const ex = h.x + hx * 0.7 + gx * 1.0 * s, ey = h.y + hy * 0.7 + gy * 1.0 * s;
    svg += `<circle cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="0.65" fill="#fff"/>`;
    svg += `<circle cx="${(ex + hx * 0.15).toFixed(2)}" cy="${(ey + hy * 0.15).toFixed(2)}" r="0.32" fill="#000"/>`;
  }
  return svg;
}

function gambarDekorasi() {
  let svg = '';
  for (const [dari, ke] of Object.entries(LADDERS)) svg += gambarTangga(+dari, ke);
  for (const [kepala, ekor] of Object.entries(SNAKES)) svg += gambarUlar(+kepala, ekor);
  $('overlay').innerHTML = svg;
}

/* ---------- 3. PION ---------- */

function buatPion() {
  document.querySelectorAll('.pawn').forEach((el) => el.remove());
  state.players.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'pawn';
    el.style.setProperty('--pc', p.color);
    el.textContent = p.icon;
    el.title = p.name;
    $('pawn-layer').appendChild(el);
    p.el = el;
  });
}

function renderPawns() {
  state.players.forEach((p, i) => {
    let x, y;
    if (p.pos === 0) {
      x = 16 + i * 6;
      y = 104;
    } else {
      const c = cellCenter(p.pos);
      x = c.x + (i === 0 ? -2.2 : 2.2);
      y = c.y + 2.4;
    }
    p.el.style.left = x + '%';
    p.el.style.top = y + '%';
  });
}

/** Animasi loncat: melambung lalu mendarat gepeng. */
function hop(player) {
  const tinggi = $('board').offsetWidth * 0.07;
  const base = 'translate(-50%, -50%)';
  player.el.animate([
    { transform: `${base} scale(1, 1)` },
    { transform: `${base} translateY(${-tinggi * 0.5}px) scale(.92, 1.12)`, offset: 0.3 },
    { transform: `${base} translateY(${-tinggi}px) scale(1.05, 1.05)`, offset: 0.55 },
    { transform: `${base} translateY(0) scale(1.18, .78)`, offset: 0.88 },
    { transform: `${base} scale(1, 1)` },
  ], { duration: HOP_DURATION, easing: 'ease-in-out' });
}

/** Naik tangga: membesar & bergoyang. Turun ular: berputar. */
function efekLompat(player, type) {
  const base = 'translate(-50%, -50%)';
  const frames = type === 'ladder'
    ? [
        { transform: `${base} scale(1)` },
        { transform: `${base} scale(1.5) rotate(-12deg)`, offset: 0.25 },
        { transform: `${base} scale(1.3) rotate(12deg)`, offset: 0.6 },
        { transform: `${base} scale(1)` },
      ]
    : [
        { transform: `${base} rotate(0deg) scale(1)` },
        { transform: `${base} rotate(360deg) scale(.8)`, offset: 0.5 },
        { transform: `${base} rotate(720deg) scale(1)` },
      ];
  player.el.animate(frames, { duration: JUMP_DELAY, easing: 'ease-in-out' });
}

/* ---------- 4. UI SIDEBAR ---------- */

function log(msg, type = 'info') {
  const li = document.createElement('li');
  li.className = 'log-item ' + type;
  li.innerHTML = `<span>${LOG_ICON[type] || '•'}</span><span></span>`;
  li.lastChild.textContent = msg;
  $('log').prepend(li);
  while ($('log').children.length > 50) $('log').lastChild.remove();
}

function setDiceFace(n) {
  const on = DICE_PIPS[n];
  document.querySelectorAll('#dice .pip').forEach((pip, i) => pip.classList.toggle('on', on.includes(i)));
}

function buildStatus() {
  const box = $('status');
  box.innerHTML = '';
  state.players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'pos-row';
    row.style.setProperty('--pc', p.color);
    row.innerHTML = `
      <div class="pos-head"><span class="mini-av">${p.icon}</span><strong>${p.name}</strong><span class="pos-num"></span></div>
      <div class="track-wrap"><div class="track"><div class="fill"></div></div><span class="marker">${p.icon}</span></div>`;
    box.appendChild(row);
    p.rowEl = row;
    p.numEl = row.querySelector('.pos-num');
  });
}

function updateUI() {
  const p = state.players[state.current];

  const card = $('turn-card');
  card.style.setProperty('--pc', p.color);
  card.classList.toggle('busy', state.busy);
  if (lastShownTurn !== state.current) {
    lastShownTurn = state.current;
    card.classList.remove('swap');
    void card.offsetWidth;
    card.classList.add('swap');
  }
  $('turn-avatar').textContent = p.icon;
  $('turn-name').textContent = p.name + (p.isBot ? ' (Bot)' : '');
  $('turn-hint').textContent = state.over ? 'Permainan selesai'
    : state.busy ? 'Sedang bergerak…'
    : p.isBot ? 'Bot akan melempar dadu…'
    : 'Ayo, lempar dadumu!';

  state.players.forEach((pl, i) => {
    pl.rowEl.style.setProperty('--v', pl.pos / 100);
    pl.rowEl.classList.toggle('active', i === state.current && !state.over);
    pl.numEl.innerHTML = pl.pos === 0 ? 'Start' : `${pl.pos}<small>/100</small>`;
  });

  $('roll-btn').disabled = state.busy || state.over || p.isBot;
}

/* ---------- 5. DADU & PERGERAKAN ---------- */

async function rollDice() {
  const dice = $('dice');
  dice.classList.add('rolling');
  sfx.diceRoll(ROLL_TIME / 1000);           // suara dadu berputar (satu rangkaian)
  const t0 = performance.now();
  while (performance.now() - t0 < ROLL_TIME) {
    setDiceFace(Math.floor(Math.random() * 6) + 1);
    await sleep(80);
  }
  dice.classList.remove('rolling');
  const value = Math.floor(Math.random() * 6) + 1;
  setDiceFace(value);
  sfx.diceLand();
  dice.classList.remove('land');
  void dice.offsetWidth;
  dice.classList.add('land');
  $('dice-value').textContent = 'Hasil lemparan: ' + value;
  return value;
}

async function moveStepByStep(player, from, to) {
  for (let pos = from + 1; pos <= to; pos++) {
    player.pos = pos;
    sfx.hop(pos);
    hop(player);
    renderPawns();
    updateUI();
    await sleep(STEP_DELAY);
  }
}

/** type: 'ladder' (naik) atau 'snake' (turun). */
async function lompat(player, to, type) {
  player.el.classList.add('slide');
  if (type === 'ladder') sfx.ladder(); else sfx.snake();
  efekLompat(player, type);
  player.pos = to;
  renderPawns();
  updateUI();
  await sleep(JUMP_DELAY);
  player.el.classList.remove('slide');
}

/* ---------- 6. SISTEM MODAL SOAL ---------- */

function askChallenge(type, player, to) {
  return new Promise((resolve) => {
    const q = MathQuestions.getQuestion();
    const isLadder = type === 'ladder';

    const title = $('challenge-title');
    title.className = 'challenge-title ' + type;
    title.textContent = isLadder
      ? `🪜 ${player.name} di TANGGA! Benar → naik ke petak ${to}`
      : `🐍 ${player.name} di KEPALA ULAR! Salah → turun ke petak ${to}`;
    $('challenge-topic').textContent = q.topic;
    $('challenge-question').textContent = q.question;
    $('challenge-feedback').textContent = '';
    $('challenge-feedback').className = 'feedback';
    $('challenge-continue').classList.add('hidden');

    const optBox = $('challenge-options');
    optBox.innerHTML = '';
    const buttons = q.options.map((opt) => {
      const b = document.createElement('button');
      b.textContent = opt;
      b.dataset.value = opt;
      optBox.appendChild(b);
      return b;
    });

    const evaluate = (chosen) => {
      const correct = chosen === q.answer;
      if (correct) sfx.correct(); else sfx.wrong();
      buttons.forEach((b) => {
        b.disabled = true;
        if (Number(b.dataset.value) === q.answer) b.classList.add('correct');
        else if (Number(b.dataset.value) === chosen) b.classList.add('wrong');
      });
      const fb = $('challenge-feedback');
      fb.textContent = correct ? '✅ Benar!' : `❌ Salah. Jawaban yang benar: ${q.answer}`;
      fb.classList.add(correct ? 'ok' : 'bad');

      const close = () => { $('challenge-modal').classList.add('hidden'); resolve(correct); };
      if (player.isBot) {
        setTimeout(close, 1800);
      } else {
        const btn = $('challenge-continue');
        btn.classList.remove('hidden');
        btn.onclick = close;
      }
    };

    if (player.isBot) {
      buttons.forEach((b) => (b.disabled = true));
      setTimeout(() => {
        const wrongOpts = q.options.filter((o) => o !== q.answer);
        const chosen = Math.random() < BOT_ACCURACY
          ? q.answer
          : wrongOpts[Math.floor(Math.random() * wrongOpts.length)];
        evaluate(chosen);
      }, 1500);
    } else {
      buttons.forEach((b) => (b.onclick = () => evaluate(Number(b.dataset.value))));
    }

    $('challenge-modal').classList.remove('hidden');
  });
}

async function resolveSquare(player) {
  const pos = player.pos;

  if (LADDERS[pos]) {
    const ok = await askChallenge('ladder', player, LADDERS[pos]);
    if (ok) {
      await lompat(player, LADDERS[pos], 'ladder');
      log(`${player.name} menjawab benar! Naik dari petak ${pos} ke ${player.pos}.`, 'ladder');
    } else {
      log(`${player.name} menjawab salah. Gagal naik, tetap di petak ${pos}.`, 'fail');
    }
  } else if (SNAKES[pos]) {
    const ok = await askChallenge('snake', player, SNAKES[pos]);
    if (ok) {
      log(`${player.name} menjawab benar! Selamat dari ular di petak ${pos}.`, 'safe');
    } else {
      await lompat(player, SNAKES[pos], 'snake');
      log(`${player.name} menjawab salah! Turun dari petak ${pos} ke ${player.pos}.`, 'snake');
    }
  }
  await sleep(300);
}

/* ---------- 7. ALUR GILIRAN ---------- */

async function takeTurn() {
  if (state.busy || state.over) return;
  state.busy = true;
  updateUI();

  const player = state.players[state.current];
  const roll = await rollDice();
  log(`${player.name} melempar dadu: ${roll}.`, 'roll');

  const target = player.pos + roll;
  if (target > 100) {
    log(`${player.name} butuh tepat ${100 - player.pos} langkah. Tidak bergerak.`, 'warn');
  } else {
    await moveStepByStep(player, player.pos, target);
    if (player.pos !== 100) await resolveSquare(player);
  }

  if (player.pos === 100) { endGame(player); return; }
  nextTurn();
}

function nextTurn() {
  state.current = (state.current + 1) % state.players.length;
  state.busy = false;
  updateUI();
  if (state.players[state.current].isBot) setTimeout(takeTurn, 900);
}

function endGame(winner) {
  state.over = true;
  state.busy = false;
  log(`${winner.name} mencapai petak 100 dan menang!`, 'win');
  updateUI();
  sfx.win();
  $('win-text').textContent = `🏆 ${winner.icon} ${winner.name} Menang!`;
  $('win-modal').classList.remove('hidden');
}

/* ---------- 8. INISIALISASI ---------- */

function startGame(mode) {
  const css = getComputedStyle(document.documentElement);
  state.players = [
    { name: 'Pemain 1', icon: '🐴', pos: 0, color: css.getPropertyValue('--p1').trim(), isBot: false },
    { name: mode === 'bot' ? 'Bot' : 'Pemain 2', icon: '🐰', pos: 0, color: css.getPropertyValue('--p2').trim(), isBot: mode === 'bot' },
  ];
  state.current = 0;
  state.busy = false;
  state.over = false;
  lastShownTurn = -1;
  $('log').innerHTML = '';
  $('dice-value').textContent = 'Belum dilempar';
  setDiceFace(1);
  buatPion();
  buildStatus();
  renderPawns();
  updateUI();
  log('Permainan dimulai. Selamat bermain!', 'info');
}

function showStartModal() {
  $('win-modal').classList.add('hidden');
  $('challenge-modal').classList.add('hidden');
  $('start-modal').classList.remove('hidden');
}

document.querySelectorAll('#start-modal [data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    ac();   // aktifkan audio setelah klik pertama pengguna
    $('start-modal').classList.add('hidden');
    startGame(btn.dataset.mode);
  });
});
$('roll-btn').addEventListener('click', () => {
  ac();
  if (state.players.length && !state.players[state.current].isBot) takeTurn();
});
$('restart-btn').addEventListener('click', showStartModal);
$('win-restart').addEventListener('click', showStartModal);
$('mute-btn').addEventListener('click', () => {
  muted = !muted;
  $('mute-btn').textContent = muted ? '🔇' : '🔊';
  if (!muted) { ac(); tone(660, 0.12, { vol: 0.12 }); }
});

setDiceFace(1);
buildBoard();