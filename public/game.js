// ── game.js ──────────────────────────────────────────────────────
// FIX #1 (cliente): Eliminar todos los JSON.parse/JSON.stringify redundantes.
// Socket.IO ya entrega objetos nativos — no necesitamos deserializar manualmente.
const socket = io({
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// DOM
const lobby = document.getElementById('lobby');
const hud = document.getElementById('hud');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapEl = document.getElementById('minimap');
const mmCtx = minimapEl.getContext('2d');
const lbRows = document.getElementById('lbRows');
const scoreVal = document.getElementById('scoreVal');
const deathScreen = document.getElementById('deathScreen');
const deathMsg = document.getElementById('deathMsg');
const ammoOrbs = document.getElementById('ammoOrbs');
const ammoCount = document.getElementById('ammoCount');
const mineOrbs = document.getElementById('mineOrbs');
const mineCount = document.getElementById('mineCount');

// Game state
let myId = null;
let players = {};
let foods = {};
let fireballs = {};
let mines = {};
let arrows = {};
let apples = [];
let greenApples = [];
let goldenApples = [];
let portals = [];
let puddles = [];
let larvas = [];
let slugs = [];
let worms = [];
let ants = [];
let hitEffects = [];
let worldW = 3000;
let worldH = 3000;
let cameraX = 0;
let cameraY = 0;
let mouse = { x: 0, y: 0 };
let boosting = false;
let rocks = [];
let leaderboard = [];
let lastSent = { angle: 0, boosting: false };
let lastAmmo = -1;

// ── SKIN SYSTEM ────────────────────────────────────────────────────
const SKIN_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#54A0FF', '#5F27CD',
  '#00D2D3', '#1DD1A1', '#FF9FF3', '#C44569', '#48DBFB',
  '#EE5A24', '#009432', '#F8B739', '#0652DD', '#9980FA',
  '#ED4C67', '#A3CB38', '#1289A7', '#C4E538', '#ffffff'
];
const PATTERNS = [
  { id: 'solid', label: 'Sólido' },
  { id: 'gradient', label: 'Degradado' },
  { id: 'stripes', label: 'Rayas' },
  { id: 'dots', label: 'Puntos' },
  { id: 'rainbow', label: 'Arcoíris' },
  { id: 'neon', label: 'Neón' },
  { id: 'camo', label: 'Camo' },
  { id: 'gold', label: 'Oro' },
];
let selectedColor = SKIN_COLORS[0];
let selectedPattern = 'solid';

const colorGrid = document.getElementById('colorGrid');
SKIN_COLORS.forEach(c => {
  const sw = document.createElement('div');
  sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
  sw.style.background = c;
  if (c === '#ffffff') sw.style.border = '3px solid #888';
  sw.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    selectedColor = c;
    drawPreview(); drawPatternPreviews();
  });
  colorGrid.appendChild(sw);
});

const patternGrid = document.getElementById('patternGrid');
PATTERNS.forEach(p => {
  const btn = document.createElement('div');
  btn.className = 'pattern-btn' + (p.id === selectedPattern ? ' selected' : '');
  btn.dataset.id = p.id;
  const miniC = document.createElement('canvas');
  miniC.width = 54; miniC.height = 32;
  btn.appendChild(miniC);
  const lbl = document.createElement('span');
  lbl.textContent = p.label;
  btn.appendChild(lbl);
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedPattern = p.id;
    drawPatternPreviews(); drawPreview();
  });
  patternGrid.appendChild(btn);
});

function drawPatternPreviews() {
  document.querySelectorAll('.pattern-btn').forEach(btn => {
    const pid = btn.dataset.id;
    const miniC = btn.querySelector('canvas');
    const mCtx = miniC.getContext('2d');
    mCtx.clearRect(0, 0, 54, 32);
    for (let i = 3; i >= 0; i--) {
      const cx2 = 8 + i * 12, cy2 = 16, r = 9;
      mCtx.shadowBlur = 0;
      applySegmentStyle(mCtx, pid, selectedColor, i, 4, cx2, cy2, r, false);
      mCtx.beginPath(); mCtx.arc(cx2, cy2, r, 0, Math.PI * 2); mCtx.fill();
      if (pid === 'neon') mCtx.stroke();
      mCtx.shadowBlur = 0;
    }
  });
}

const previewCanvas = document.getElementById('skinPreview');
const pCtx = previewCanvas.getContext('2d');
function drawPreview() {
  pCtx.clearRect(0, 0, 220, 56);
  for (let i = 9; i >= 0; i--) {
    const cx2 = 20 + i * 18, cy2 = 28, r = i === 0 ? 11 : 9;
    pCtx.shadowBlur = 0;
    applySegmentStyle(pCtx, selectedPattern, selectedColor, i, 10, cx2, cy2, r, i === 0);
    pCtx.beginPath(); pCtx.arc(cx2, cy2, r, 0, Math.PI * 2); pCtx.fill();
    if (selectedPattern === 'neon') pCtx.stroke();
    pCtx.shadowBlur = 0;
    drawSegmentOverlay(pCtx, selectedPattern, selectedColor, cx2, cy2, r, i);
    if (i === 0) {
      for (const s of [-1, 1]) {
        pCtx.beginPath(); pCtx.arc(cx2 - 2 + s * 4, cy2 - 2, 3, 0, Math.PI * 2); pCtx.fillStyle = '#fff'; pCtx.fill();
        pCtx.beginPath(); pCtx.arc(cx2 - 2 + s * 4 + .5, cy2 - 1.5, 1.5, 0, Math.PI * 2); pCtx.fillStyle = '#222'; pCtx.fill();
      }
    }
  }
  drawPatternPreviews();
}
drawPreview();

// ── Skin renderer ─────────────────────────────────────────────────
function applySegmentStyle(c, pattern, color, segIndex, totalSegs, cx2, cy2, r, isHead) {
  switch (pattern) {
    case 'solid':
      c.fillStyle = adjustBrightness(color, isHead ? 120 : 80 + (1 - segIndex / totalSegs) * 20); break;
    case 'gradient': {
      const g = c.createRadialGradient(cx2 - r * .3, cy2 - r * .3, 0, cx2, cy2, r);
      g.addColorStop(0, lightenColor(color, 60)); g.addColorStop(1, darkenColor(color, 40));
      c.fillStyle = g; break;
    }
    case 'stripes':
      c.fillStyle = Math.floor(segIndex / 3) % 2 === 0 ? adjustBrightness(color, 100) : darkenColor(color, 50); break;
    case 'dots':
      c.fillStyle = adjustBrightness(color, 90); break;
    case 'rainbow':
      c.fillStyle = `hsl(${(segIndex * 15) % 360},90%,${isHead ? 65 : 55}%)`; break;
    case 'neon':
      c.fillStyle = darkenColor(color, 70); c.strokeStyle = adjustBrightness(color, 110);
      c.lineWidth = 2.5; c.shadowBlur = 14; c.shadowColor = color; break;
    case 'camo': {
      const sh = [darkenColor(color, 60), darkenColor(color, 40), adjustBrightness(color, 80), darkenColor(color, 20)];
      c.fillStyle = sh[segIndex % 4]; break;
    }
    case 'gold': {
      const gold = ['#FFD700', '#FFA500', '#FFD700', '#FFEC8B', '#DAA520', '#FFD700', '#FFA500', '#FFEC8B'];
      c.fillStyle = gold[segIndex % 8]; c.shadowBlur = isHead ? 12 : 4; c.shadowColor = '#FFD70088'; break;
    }
    default: c.fillStyle = color;
  }
}
function drawSegmentOverlay(c, pattern, color, cx2, cy2, r, si) {
  if (pattern === 'dots' && si % 4 === 0) {
    c.save(); c.fillStyle = lightenColor(color, 80); c.globalAlpha = .5;
    c.beginPath(); c.arc(cx2 - r * .25, cy2 - r * .25, r * .28, 0, Math.PI * 2); c.fill(); c.restore();
  }
  if (pattern === 'gradient') {
    c.save(); c.globalAlpha = .18; c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(cx2 - r * .3, cy2 - r * .35, r * .45, r * .25, -Math.PI / 4, 0, Math.PI * 2); c.fill(); c.restore();
  }
}

// ── Resize ────────────────────────────────────────────────────────
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// ── Input ─────────────────────────────────────────────────────────
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('touchmove', e => { e.preventDefault(); mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }, { passive: false });
window.addEventListener('mousedown', (e) => { if (!e.target.closest('button')) boosting = true; });
window.addEventListener('mouseup', () => { boosting = false; });
window.addEventListener('touchstart', (e) => { if (!e.target.closest('button')) boosting = true; }, { passive: true });
window.addEventListener('touchend', () => { boosting = false; });

const keys = {};
window.addEventListener('keydown', e => {
  if (keys[e.key]) return;
  keys[e.key] = true;
  if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); shootFireball(); }
  if (e.key === 'w' || e.key === 'W') { e.preventDefault(); placeMine(); }
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); shootArrow(); }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

const fireBtn = document.getElementById('fireBtn');
if (fireBtn) {
  fireBtn.addEventListener('touchstart', e => { e.preventDefault(); shootFireball(); });
  fireBtn.addEventListener('mousedown', e => { e.preventDefault(); shootFireball(); });
}
const mineBtn = document.getElementById('mineBtn');
if (mineBtn) {
  mineBtn.addEventListener('touchstart', e => { e.preventDefault(); placeMine(); });
  mineBtn.addEventListener('mousedown', e => { e.preventDefault(); placeMine(); });
}
const arrowBtn = document.getElementById('arrowBtn');
if (arrowBtn) {
  arrowBtn.addEventListener('touchstart', e => { e.preventDefault(); shootArrow(); });
  arrowBtn.addEventListener('mousedown', e => { e.preventDefault(); shootArrow(); });
}

// ── Actions ───────────────────────────────────────────────────────
function shootFireball() {
  const me = players[myId];
  if (!me || !me.alive) return;
  if (!me.invisible && me.ammo <= 0) return;
  socket.emit('fireball');
  const orbEls = ammoOrbs.querySelectorAll('.ammo-orb.loaded');
  if (orbEls.length > 0) {
    const last = orbEls[orbEls.length - 1];
    last.classList.remove('loaded'); last.classList.add('firing');
    setTimeout(() => last.classList.remove('firing'), 350);
  }
}
function placeMine() {
  const me = players[myId];
  if (!me || !me.alive) return;
  socket.emit('mine');
  const orbEls = mineOrbs.querySelectorAll('.mine-orb.loaded');
  if (orbEls.length > 0) {
    const last = orbEls[orbEls.length - 1];
    last.classList.remove('loaded'); last.classList.add('placing');
    setTimeout(() => last.classList.remove('placing'), 350);
  }
}
function shootArrow() {
  const me = players[myId];
  if (!me || !me.alive) return;
  if (!me.invisible && (me.score < 50 || me.arrowAmmo <= 0)) return;
  socket.emit('arrow');
  const orbEls = arrowOrbs.querySelectorAll('.arrow-orb.loaded');
  if (orbEls.length > 0) {
    const last = orbEls[orbEls.length - 1];
    last.classList.remove('loaded'); last.classList.add('firing');
    setTimeout(() => last.classList.remove('firing'), 350);
  }
}

// ── Lobby ─────────────────────────────────────────────────────────
document.getElementById('playBtn').addEventListener('click', joinGame);
document.getElementById('nickname').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });
function joinGame() {
  const name = document.getElementById('nickname').value.trim() || 'Snake';
  lobby.style.display = 'none'; hud.style.display = 'block';
  socket.emit('join', { name, color: selectedColor, pattern: selectedPattern });
}

// ── Socket events ─────────────────────────────────────────────────
socket.on('playerJoined', data => {
  console.log('🚀 Jugador unido:', data.name || data);
});
socket.on('connect', () => console.log('✅ Socket conectado:', socket.id));
socket.on('connect_error', (err) => console.error('❌ Socket error:', err));

let isInitialized = false;
socket.on('init', data => {
  // FIX CRÍTICO: El servidor ya no usa JSON.stringify — recibimos objeto nativo.
  // Mantenemos el fallback por si acaso, pero data ya será un objeto.
  if (typeof data === 'string') data = JSON.parse(data);
  if (isInitialized) return;
  console.log('📦 Init recibido:', data.id);
  myId = data.id;
  worldW = data.worldWidth || 3000;
  worldH = data.worldHeight || 3000;

  // Formato compacto de comida: [id, x, y, value]
  foods = {};
  data.foods.forEach(f => { foods[f[0]] = { id: f[0], x: f[1], y: f[2], value: f[3] }; });

  players = {};
  data.players.forEach(p => {
    if (!p.segments && p.head) p.segments = [p.head, p.head];
    players[p.id] = p;
  });

  fireballs = {}; (data.fireballs || []).forEach(fb => { fireballs[fb.id] = fb; });
  mines = {}; (data.mines || []).forEach(m => { mines[m.id] = m; });
  arrows = {}; (data.arrows || []).forEach(a => { arrows[a.id] = a; });
  apples = data.apples || [];
  greenApples = data.greenApples || [];
  goldenApples = data.goldenApples || [];
  portals = data.portals || [];
  puddles = data.puddles || [];
  larvas = data.larvas || [];
  slugs = data.slugs || [];

  worms = (data.worms || []).map(wu => {
    if (!wu.segs && wu.head) { wu.segs = []; for (let i = 0; i < (wu.len || 5); i++) wu.segs.push({ ...wu.head }); }
    return wu;
  });

  rocks = data.rocks || [];
  ants = data.ants || [];
  console.log('🎮 Entidades inicializadas:', { players: data.players.length, food: data.foods.length, worms: worms.length });
  isInitialized = true;
  requestAnimationFrame(loop);
});

let lastTickLog = 0;
socket.on('tick', data => {
  // FIX CRÍTICO: El servidor ya no usa JSON.stringify — recibimos objeto nativo.
  if (typeof data === 'string') data = JSON.parse(data);
  try {
    if (!data) return;
    if (Date.now() - lastTickLog > 5000) {
      console.log('💓 Tick:', Object.keys(data.players || {}).length, 'jugadores');
      lastTickLog = Date.now();
    }

    // Actualizar jugadores
    for (const pid in data.players) {
      const pu = data.players[pid];
      if (!players[pid]) { players[pid] = pu; continue; }
      for (const key in pu) {
        if (key !== 'segments' && key !== 'head') players[pid][key] = pu[key];
      }
      // FIX #6 (cliente): Interpolación de segmentos con solo la cabeza
      if (pu.segments) {
        players[pid].segments = pu.segments;
      } else if (pu.head) {
        const segs = players[pid].segments || [];
        if (segs.length === 0 || (segs[0].x !== pu.head.x || segs[0].y !== pu.head.y)) {
          segs.unshift(pu.head);
          while (segs.length > (pu.len || 1)) segs.pop();
        }
        players[pid].segments = segs;
      }
    }

    // Comida
    for (const fc of (data.foodChanges || [])) {
      if (fc.type === 'add') foods[fc.food.id] = fc.food;
      if (fc.type === 'remove') delete foods[fc.id];
    }

    // Fireballs
    for (const fd of (data.fbDelta || [])) {
      if (fd.type === 'update') fireballs[fd.fb.id] = fd.fb;
      if (fd.type === 'remove') delete fireballs[fd.id];
    }
    // Mines
    for (const md of (data.mineDelta || [])) {
      if (md.type === 'update') mines[md.mine.id] = md.mine;
      if (md.type === 'remove') delete mines[md.id];
    }
    // Arrows
    for (const ad of (data.arrowDelta || [])) {
      if (ad.type === 'update') arrows[ad.arrow.id] = ad.arrow;
      if (ad.type === 'remove') delete arrows[ad.id];
    }

    // Efectos visuales de impacto
    for (const hit of (data.fbHits || [])) spawnExplosion(hit.x, hit.y, players[hit.targetId]?.color || '#ff6b00');
    for (const hit of (data.mineHits || [])) spawnExplosion(hit.x, hit.y, '#ff0000');
    for (const hit of (data.shieldHits || [])) spawnExplosion(hit.x, hit.y, '#00e5ff');
    for (const hit of (data.arrowHits || [])) spawnExplosion(hit.x, hit.y, '#00e5ff');

    if (data.apples) apples = data.apples;
    if (data.greenApples) greenApples = data.greenApples;
    if (data.goldenApples) goldenApples = data.goldenApples;
    if (data.portals) portals = data.portals;
    if (data.puddles) puddles = data.puddles;
    if (data.larvas) larvas = data.larvas;
    if (data.slugs) slugs = data.slugs;
    if (data.ants) ants = data.ants;

    // FIX #6 (cliente): Interpolación de segmentos de gusanos con solo la cabeza
    if (data.worms) {
      const newWorms = [];
      for (const wu of data.worms) {
        let oldWorm = worms.find(w => w.id === wu.id);
        if (!oldWorm) {
          if (!wu.segs && wu.head) wu.segs = [wu.head, wu.head];
          newWorms.push(wu);
        } else {
          const segs = oldWorm.segs || [];
          if (wu.segs) {
            oldWorm.segs = wu.segs;
          } else if (wu.head) {
            if (segs.length === 0 || (segs[0].x !== wu.head.x || segs[0].y !== wu.head.y)) {
              segs.unshift(wu.head);
              while (segs.length > (wu.len || 1)) segs.pop();
            }
            oldWorm.segs = segs;
          }
          oldWorm.angle = wu.angle;
          newWorms.push(oldWorm);
        }
      }
      worms = newWorms;
    }

    if (data.rocks) rocks = data.rocks;
    leaderboard = data.leaderboard || leaderboard;
    updateAmmoBar();
    updateMineBar();
    updateArrowBar();
    updateBuffUI();
  } catch (err) {
    console.error('❌ Error procesando Tick:', err);
  }
});

socket.on('fireballSpawned', fb => { fireballs[fb.id] = fb; });
socket.on('mineSpawned', m => { mines[m.id] = m; });
socket.on('arrowSpawned', a => { arrows[a.id] = a; });
socket.on('arrowHit', data => { spawnExplosion(data.x, data.y, '#00e5ff'); });
socket.on('playerLeft', data => { delete players[data.id]; });
socket.on('died', data => {
  const killer = players[data.killedBy];
  if (deathMsg) deathMsg.textContent = killer ? `Te eliminó ${killer.name}.` : 'Chocaste con el borde del escenario o un obstáculo.';
  if (deathScreen) deathScreen.classList.add('show');
});
socket.on('respawned', data => {
  players[myId] = data.player;
  if (deathScreen) deathScreen.classList.remove('show');
  updateAmmoBar(); updateMineBar();
});
document.getElementById('respawnBtn').addEventListener('click', () => {
  // FIX #1 (cliente): Objeto nativo, sin JSON.stringify
  socket.emit('respawn', { color: selectedColor, pattern: selectedPattern });
});

// ── Ammo bar UI ───────────────────────────────────────────────────
function buildAmmoOrbs(max) {
  ammoOrbs.innerHTML = '';
  for (let i = 0; i < max; i++) { const orb = document.createElement('div'); orb.className = 'ammo-orb'; ammoOrbs.appendChild(orb); }
}
function updateAmmoBar() {
  const me = players[myId]; if (!me) return;
  const ammo = me.ammo ?? 5, max = me.maxAmmo ?? 5;
  if (ammoOrbs.children.length !== max) buildAmmoOrbs(max);
  if (ammo === lastAmmo) return;
  lastAmmo = ammo;
  ammoCount.textContent = `${ammo}/${max}`;
  ammoOrbs.querySelectorAll('.ammo-orb').forEach((orb, i) => {
    if (i < ammo) orb.classList.add('loaded'); else orb.classList.remove('loaded');
  });
}

// ── Mine bar UI ───────────────────────────────────────────────────
function buildMineOrbs(max) {
  mineOrbs.innerHTML = '';
  for (let i = 0; i < max; i++) { const orb = document.createElement('div'); orb.className = 'mine-orb'; mineOrbs.appendChild(orb); }
}
let lastMines = -1;
function updateMineBar() {
  const me = players[myId]; if (!me) return;
  const m = me.mines ?? 3, max = me.maxMines ?? 3;
  if (mineOrbs.children.length !== max) buildMineOrbs(max);
  if (m === lastMines) return;
  lastMines = m;
  mineCount.textContent = `${m}/${max}`;
  mineOrbs.querySelectorAll('.mine-orb').forEach((orb, i) => {
    if (i < m) orb.classList.add('loaded'); else orb.classList.remove('loaded');
  });
}

// ── Arrow bar UI ──────────────────────────────────────────────────
const arrowBar = document.getElementById('arrowBar');
const arrowOrbs = document.getElementById('arrowOrbs');
const arrowCount = document.getElementById('arrowCount');
function buildArrowOrbs(max) {
  arrowOrbs.innerHTML = '';
  for (let i = 0; i < max; i++) { const orb = document.createElement('div'); orb.className = 'arrow-orb'; arrowOrbs.appendChild(orb); }
}
let lastArrowCount = -1;
function updateArrowBar() {
  const me = players[myId]; if (!me) return;
  if (me.score >= 50) { arrowBar.style.display = 'flex'; if (arrowBtn) arrowBtn.style.display = 'flex'; }
  else { arrowBar.style.display = 'none'; if (arrowBtn) arrowBtn.style.display = 'none'; }
  const ammo = me.arrowAmmo ?? 0, max = 5;
  if (arrowOrbs.children.length !== max) buildArrowOrbs(max);
  if (ammo === lastArrowCount) return;
  lastArrowCount = ammo;
  arrowCount.textContent = `${ammo}/${max}`;
  arrowOrbs.querySelectorAll('.arrow-orb').forEach((orb, i) => {
    if (i < ammo) orb.classList.add('loaded'); else orb.classList.remove('loaded');
  });
}

// ── Buff UI ────────────────────────────────────────────────────────
const buffIndicator = document.getElementById('buffIndicator');
const buffIcon = document.getElementById('buffIcon');
const buffLabel = document.getElementById('buffLabel');
function updateBuffUI() {
  const me = players[myId]; if (!me) return;
  if (me.protected) { buffIndicator.className = 'active'; buffIcon.textContent = '🍎'; buffLabel.textContent = 'ESCUDO'; }
  else if (me.lethal) { buffIndicator.className = 'active green'; buffIcon.textContent = '🍏'; buffLabel.textContent = 'LETAL'; }
  else if (me.invisible) { buffIndicator.className = 'active golden'; buffIcon.textContent = '👁️'; buffLabel.textContent = 'INVISIBILIDAD'; }
  else { buffIndicator.className = ''; }
}

// ── Explosion particles ───────────────────────────────────────────
function spawnExplosion(wx, wy, color) {
  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 / 14) * i + Math.random() * .3, speed = 1.5 + Math.random() * 3;
    hitEffects.push({ wx, wy, color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 30 + Math.random() * 20, maxLife: 50, r: 2 + Math.random() * 3 });
  }
}
function updateAndDrawEffects() {
  for (let i = hitEffects.length - 1; i >= 0; i--) {
    const e = hitEffects[i];
    e.wx += e.vx; e.wy += e.vy; e.vx *= 0.88; e.vy *= 0.88; e.life -= 1;
    if (e.life <= 0) { hitEffects.splice(i, 1); continue; }
    const { x, y } = worldToScreen(e.wx, e.wy);
    ctx.save(); ctx.globalAlpha = e.life / e.maxLife; ctx.shadowBlur = 6; ctx.shadowColor = e.color;
    ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(x, y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

// ── Input sending ─────────────────────────────────────────────────
function sendInput() {
  if (!players[myId]) return;
  let angle = Math.atan2(mouse.y - canvas.height / 2, mouse.x - canvas.width / 2);
  if (keys['ArrowLeft']) angle = Math.PI;
  else if (keys['ArrowRight']) angle = 0;
  else if (keys['ArrowUp']) angle = -Math.PI / 2;
  else if (keys['ArrowDown']) angle = Math.PI / 2;
  if (keys['ArrowUp'] && keys['ArrowRight']) angle = -Math.PI / 4;
  if (keys['ArrowUp'] && keys['ArrowLeft']) angle = -3 * Math.PI / 4;
  if (keys['ArrowDown'] && keys['ArrowRight']) angle = Math.PI / 4;
  if (keys['ArrowDown'] && keys['ArrowLeft']) angle = 3 * Math.PI / 4;
  if (angle !== lastSent.angle || boosting !== lastSent.boosting) {
    // FIX #1 (cliente): Objeto nativo — sin JSON.stringify
    socket.emit('input', { angle, boosting });
    lastSent = { angle, boosting };
  }
}

// ── Drawing ───────────────────────────────────────────────────────
function worldToScreen(wx, wy) { return { x: wx - cameraX + canvas.width / 2, y: wy - cameraY + canvas.height / 2 }; }
function isVisible(wx, wy, margin = 60) {
  if (wx === undefined || wy === undefined) return false;
  const { x, y } = worldToScreen(wx, wy);
  return x > -margin && x < canvas.width + margin && y > -margin && y < canvas.height + margin;
}

function drawBackground() {
  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const hex = 40;
  ctx.strokeStyle = '#1e242c'; ctx.lineWidth = 0.7;
  const offX = ((-(cameraX || 0) + canvas.width / 2) % (hex * 1.5) + (hex * 1.5)) % (hex * 1.5);
  const offY = ((-(cameraY || 0) + canvas.height / 2) % (hex * Math.sqrt(3)) + (hex * Math.sqrt(3))) % (hex * Math.sqrt(3));
  ctx.save(); ctx.translate(offX, offY);
  for (let row = -2; row < canvas.height / (hex * Math.sqrt(3)) + 2; row++) {
    for (let col = -2; col < canvas.width / (hex * 1.5) + 2; col++) {
      const cx2 = col * hex * 1.5, cy2 = row * hex * Math.sqrt(3) + (col % 2 === 0 ? 0 : hex * Math.sqrt(3) / 2);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); i === 0 ? ctx.moveTo(cx2 + hex * .92 * Math.cos(a), cy2 + hex * .92 * Math.sin(a)) : ctx.lineTo(cx2 + hex * .92 * Math.cos(a), cy2 + hex * .92 * Math.sin(a)); }
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWorldBorder() {
  const borderWidth = 8, borderColor = '#ff0000';
  const topLeft = worldToScreen(0, 0), topRight = worldToScreen(worldW, 0);
  const bottomLeft = worldToScreen(0, worldH), bottomRight = worldToScreen(worldW, worldH);
  ctx.save();
  ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.shadowBlur = 15; ctx.shadowColor = borderColor;
  ctx.beginPath(); ctx.moveTo(topLeft.x, topLeft.y); ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y); ctx.lineTo(bottomLeft.x, bottomLeft.y); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.rect(-1000, -1000, canvas.width + 2000, canvas.height + 2000);
  ctx.rect(topLeft.x, topLeft.y, topRight.x - topLeft.x, bottomLeft.y - topLeft.y);
  ctx.fillStyle = 'rgba(255,0,0,0.18)'; ctx.shadowBlur = 0; ctx.fill('evenodd');
  ctx.restore();
}

function drawFood(f) {
  if (!isVisible(f.x, f.y, 20)) return;
  const { x, y } = worldToScreen(f.x, f.y);
  ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = f.color;
  ctx.beginPath(); ctx.arc(x, y, f.value > 1 ? 7 : 4.5, 0, Math.PI * 2);
  ctx.fillStyle = f.color; ctx.fill(); ctx.restore();
}

function drawApple(a) {
  if (!isVisible(a.x, a.y, 20)) return;
  const { x, y } = worldToScreen(a.x, a.y);
  if (a.life < 45 && Math.floor(Date.now() / 150) % 2 === 0) return;
  ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = '#ff0000';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = '#ff3333'; ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#3fb950';
  ctx.beginPath(); ctx.ellipse(x + 3, y - 7, 4, 2, -Math.PI / 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawGreenApple(a) {
  if (!isVisible(a.x, a.y, 20)) return;
  const { x, y } = worldToScreen(a.x, a.y);
  if (a.life < 45 && Math.floor(Date.now() / 150) % 2 === 0) return;
  ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = '#00ff00';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = '#32cd32'; ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#8b4513';
  ctx.beginPath(); ctx.ellipse(x + 3, y - 7, 4, 2, -Math.PI / 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawGoldenApple(a) {
  if (!isVisible(a.x, a.y, 40)) return;
  const { x, y } = worldToScreen(a.x, a.y);
  ctx.save(); ctx.shadowBlur = 25; ctx.shadowColor = '#ffea00';
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, 18);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#ffea00'); grad.addColorStop(1, '#ff9100');
  ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(x - 6, y - 8, 6, 3, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4037';
  ctx.beginPath(); ctx.ellipse(x + 4, y - 16, 6, 3, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPortal(port) {
  if (!isVisible(port.x, port.y, 60)) return;
  const { x, y } = worldToScreen(port.x, port.y);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Date.now() * -0.003);
  const g = ctx.createRadialGradient(0, 0, 5, 0, 0, 35);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#cc00ff'); g.addColorStop(1, 'rgba(68,0,170,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 35 + Math.sin(Date.now() * 0.005) * 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPuddle(p) {
  if (!isVisible(p.x, p.y, 80)) return;
  const { x, y } = worldToScreen(p.x, p.y);
  ctx.save(); ctx.translate(x, y);
  const maxLife = 630, age = maxLife - p.life, growEnd = 60, shrinkStart = maxLife - 60;
  let lifecycle = 1;
  if (age < growEnd) lifecycle = age / growEnd;
  else if (p.life < 60) lifecycle = p.life / 60;
  lifecycle = Math.max(0.01, Math.min(1, lifecycle));
  const t = Date.now() * 0.002;
  ctx.scale(lifecycle * (1 + Math.sin(t) * 0.05), lifecycle * (1 + Math.cos(t * 0.8) * 0.05));
  const alpha = lifecycle * 0.4;
  ctx.beginPath();
  ctx.moveTo(0, -60); ctx.bezierCurveTo(40, -60, 60, -20, 50, 20);
  ctx.bezierCurveTo(40, 60, -10, 70, -40, 40); ctx.bezierCurveTo(-70, 10, -50, -50, 0, -60);
  ctx.fillStyle = `rgba(0,150,255,${alpha})`; ctx.shadowBlur = 10 * lifecycle; ctx.shadowColor = 'rgba(0,150,255,0.8)'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -40); ctx.bezierCurveTo(25, -40, 40, -10, 30, 15);
  ctx.bezierCurveTo(25, 40, -5, 45, -25, 25); ctx.bezierCurveTo(-45, 5, -30, -35, 0, -40);
  ctx.fillStyle = `rgba(255,255,255,${lifecycle * 0.15})`; ctx.shadowBlur = 0; ctx.fill();
  ctx.beginPath(); ctx.ellipse(-20, -20, 10, 5, Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${lifecycle * 0.4})`; ctx.fill();
  ctx.restore();
}

function drawLarva(L) {
  if (!isVisible(L.x, L.y, 20)) return;
  const { x, y } = worldToScreen(L.x, L.y);
  ctx.save(); ctx.translate(x, y); ctx.rotate(L.angle);
  const wiggle = Math.sin(Date.now() * 0.015 + L.id) * 3;
  ctx.fillStyle = '#ffecb3'; ctx.shadowBlur = 5; ctx.shadowColor = '#ffb300';
  ctx.beginPath(); ctx.arc(-8, -wiggle, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-4, -wiggle * 0.5, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, wiggle * 0.5, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, wiggle, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(7, wiggle - 2.5, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(7, wiggle + 2.5, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSlug(S) {
  if (!isVisible(S.x, S.y, 30)) return;
  const { x, y } = worldToScreen(S.x, S.y);
  ctx.save(); ctx.translate(x, y); ctx.rotate(S.angle); ctx.scale(2, 2);
  const t = Date.now() * 0.004;
  ctx.shadowBlur = 8; ctx.shadowColor = '#76ff03';
  ctx.fillStyle = '#558b2f'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d6e63'; ctx.beginPath(); ctx.ellipse(-2, -1, 8, 7, Math.PI / 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(-2, -1, 6, Math.PI * 0.3, Math.PI * 1.8); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#7cb342';
  ctx.beginPath(); ctx.ellipse(14, 0, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
  const eyeWave = Math.sin(t) * 1.5;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(18, -4 + eyeWave, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(18, 4 - eyeWave, 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7cb342'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(16, -2); ctx.lineTo(18, -4 + eyeWave); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 2); ctx.lineTo(18, 4 - eyeWave); ctx.stroke();
  ctx.restore();
}

function drawWorm(W) {
  if (!W.segs || W.segs.length < 2) return;
  if (!isVisible(W.segs[0].x, W.segs[0].y, 80)) return;
  ctx.save();
  for (let i = W.segs.length - 1; i >= 0; i--) {
    const { x, y } = worldToScreen(W.segs[i].x, W.segs[i].y);
    const t = i / W.segs.length;
    ctx.fillStyle = `hsl(${10 + t * 30},70%,${45 + t * 15}%)`;
    ctx.shadowBlur = 3; ctx.shadowColor = 'rgba(180,80,0,0.5)';
    const r = 7 + (1 - t) * 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.stroke();
  }
  const h = worldToScreen(W.segs[0].x, W.segs[0].y);
  const dir = Math.atan2(W.segs[0].y - W.segs[1].y, W.segs[0].x - W.segs[1].x);
  ctx.shadowBlur = 0; ctx.fillStyle = '#c62828';
  ctx.beginPath(); ctx.arc(h.x, h.y, 9, 0, Math.PI * 2); ctx.fill();
  const ex = Math.cos(dir + Math.PI / 2) * 4, ey = Math.sin(dir + Math.PI / 2) * 4;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(h.x + ex, h.y + ey, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(h.x - ex, h.y - ey, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawAnt(A) {
  if (!isVisible(A.x, A.y, 20)) return;
  const { x, y } = worldToScreen(A.x, A.y);
  const paused = A.pauseTicks > 0, t = Date.now() * 0.02;
  ctx.save(); ctx.translate(x, y); ctx.rotate(A.angle);
  ctx.strokeStyle = '#c62828'; ctx.lineWidth = 1.5;
  for (let s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * 5, ly = s * (paused ? 6 : 6 + Math.sin(t + i * 1.2) * 3);
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx + s * 2, ly); ctx.stroke();
    }
  }
  ctx.fillStyle = '#b71c1c'; ctx.shadowBlur = 6; ctx.shadowColor = '#ff1744';
  ctx.beginPath(); ctx.ellipse(-5, 0, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d32f2f'; ctx.beginPath(); ctx.ellipse(3, 0, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#c62828';
  ctx.beginPath(); ctx.ellipse(9, 0, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b71c1c'; ctx.lineWidth = 1;
  const aw = paused ? 0 : Math.sin(t * 0.7) * 0.3;
  ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(16, -5 + aw * 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, 1); ctx.lineTo(16, 5 - aw * 10); ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(10.5, -1.3, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10.5, 1.3, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawFireball(fb) {
  if (!isVisible(fb.x, fb.y, 30)) return;
  const { x, y } = worldToScreen(fb.x, fb.y);
  const age = 1 - fb.life / 90;
  ctx.save();
  const trailLen = 5;
  for (let t = 1; t <= trailLen; t++) {
    const tx = x - Math.cos(fb.angle) * t * 5, ty = y - Math.sin(fb.angle) * t * 5;
    ctx.globalAlpha = (1 - t / trailLen) * 0.4;
    ctx.fillStyle = t < 3 ? '#ffdd57' : '#ff6b00';
    ctx.beginPath(); ctx.arc(tx, ty, 6 - t, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 22; ctx.shadowColor = '#ff6b00';
  const g = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, 10);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#ffdd57'); g.addColorStop(0.7, '#ff6b00'); g.addColorStop(1, 'rgba(200,40,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255,200,0,${0.6 - age * 0.5})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(Date.now() * 0.04) * 2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawMine(m) {
  if (!isVisible(m.x, m.y, 30)) return;
  const { x, y } = worldToScreen(m.x, m.y);
  const age = 1 - m.life / 120;
  ctx.save();
  ctx.shadowBlur = 15; ctx.shadowColor = '#ff0000';
  const g = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 12);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#ff4444'); g.addColorStop(0.7, '#8b0000'); g.addColorStop(1, 'rgba(139,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255,100,100,${0.6 - age * 0.5})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 14 + Math.sin(Date.now() * 0.04) * 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('☠', x, y);
  ctx.restore();
}

function drawRock(r) {
  if (!isVisible(r.x, r.y, r.radius || 40)) return;
  const { x, y } = worldToScreen(r.x, r.y);
  const rad = r.radius || 35;
  ctx.save(); ctx.translate(x, y); ctx.rotate(r.rotation || 0);
  ctx.beginPath();
  const sides = 7;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2, dist = rad * (0.85 + Math.sin(i * 3 + (r.id % 5)) * 0.15);
    if (i === 0) ctx.moveTo(Math.cos(angle) * dist, Math.sin(angle) * dist);
    else ctx.lineTo(Math.cos(angle) * dist, Math.sin(angle) * dist);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, 0, 0, 0, rad);
  g.addColorStop(0, '#4a4a4a'); g.addColorStop(0.6, '#2c2c2c'); g.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = g; ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-rad * 0.2, -rad * 0.3, rad * 0.4, rad * 0.2, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawArrow(a) {
  if (!isVisible(a.x, a.y, 40)) return;
  const { x, y } = worldToScreen(a.x, a.y);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a.angle);
  ctx.globalAlpha = 0.4; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-5, 0); ctx.stroke();
  ctx.globalAlpha = 1; ctx.shadowBlur = 10; ctx.shadowColor = '#00e5ff';
  ctx.fillStyle = '#f0f0f0';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(0, -6); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-12, 0); ctx.stroke();
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-15, -5); ctx.lineTo(-12, 0); ctx.lineTo(-15, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawSnake(p) {
  if (!p.alive || !p.segments || p.segments.length < 2) return;
  if (p.invisible && p.id !== myId) return;
  const segs = p.segments, isMe = p.id === myId;
  const color = p.color || '#3fb950', pattern = p.pattern || 'solid', total = segs.length;
  ctx.save();
  if (isMe && p.invisible) ctx.globalAlpha = 0.4;

  for (let i = total - 1; i >= 1; i--) {
    if (!isVisible(segs[i].x, segs[i].y, 30)) continue;
    const { x, y } = worldToScreen(segs[i].x, segs[i].y);
    if (p.isDestructor) {
      ctx.save();
      ctx.fillStyle = (Math.floor(i / 2) % 2 === 0) ? '#3b0066' : '#1a0033';
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,100,0,0.7)';
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6b00';
      ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x - 10, y - 20); ctx.lineTo(x - 5, y - 8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x - 10, y + 20); ctx.lineTo(x - 5, y + 8); ctx.fill();
      ctx.restore();
    } else if (p.isNpc) {
      ctx.save();
      ctx.fillStyle = (Math.floor(i / 3) % 2 === 0) ? '#48dbfb' : '#0abde3';
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,0,85,0.7)';
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.shadowBlur = 0;
      applySegmentStyle(ctx, pattern, color, i, total, x, y, 9, false);
      ctx.globalAlpha = 0.7 + (1 - i / total) * 0.3;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      if (pattern === 'neon') ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      drawSegmentOverlay(ctx, pattern, color, x, y, 9, i);
    }
  }

  const head = segs[0];
  if (isVisible(head.x, head.y)) {
    const { x: hx, y: hy } = worldToScreen(head.x, head.y);
    if (p.isDestructor) {
      const ea = Math.atan2(segs[0].y - segs[1].y, segs[0].x - segs[1].x);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ea);
      ctx.shadowBlur = 15; ctx.shadowColor = '#ff6b00'; ctx.fillStyle = '#3b0066';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a0033'; ctx.beginPath(); ctx.arc(5, 0, 14, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(10, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(11, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (p.isNpc) {
      const ea = Math.atan2(segs[0].y - segs[1].y, segs[0].x - segs[1].x);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ea);
      ctx.shadowBlur = 15; ctx.shadowColor = '#ff0055'; ctx.fillStyle = '#48dbfb';
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#f50057';
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-15, -25, -25, -20); ctx.quadraticCurveTo(-10, -13, -5, -8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.quadraticCurveTo(-15, 25, -25, 20); ctx.quadraticCurveTo(-10, 13, -5, 8); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(6, -6, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6, 6, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(7, -6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(7, 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(8, -7, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(8, 5, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      if (p.boosting) { ctx.shadowBlur = 20; ctx.shadowColor = color; }
      applySegmentStyle(ctx, pattern, color, 0, total, hx, hy, 11, true);
      ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI * 2); ctx.fill();
      if (pattern === 'neon') ctx.stroke();
      ctx.shadowBlur = 0;
      drawSegmentOverlay(ctx, pattern, color, hx, hy, 11, 0);
    }

    if (p.slow) { ctx.fillStyle = '#00a8ff'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (p.protected) {
      ctx.beginPath(); ctx.arc(hx, hy, 18, 0, Math.PI * 2); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3; ctx.shadowBlur = 12; ctx.shadowColor = '#00e5ff'; ctx.stroke(); ctx.shadowBlur = 0;
    } else if (p.lethal) {
      ctx.beginPath(); ctx.arc(hx, hy, 18, 0, Math.PI * 2); ctx.strokeStyle = '#32cd32'; ctx.lineWidth = 3; ctx.shadowBlur = 12; ctx.shadowColor = '#32cd32'; ctx.stroke(); ctx.shadowBlur = 0;
    }

    if (!p.isNpc) {
      const ea = Math.atan2(segs[0].y - segs[1].y, segs[0].x - segs[1].x);
      const px2 = Math.cos(ea + Math.PI / 2) * 4.5, py2 = Math.sin(ea + Math.PI / 2) * 4.5;
      const fx = Math.cos(ea) * 3, fy = Math.sin(ea) * 3;
      for (const s of [-1, 1]) {
        const ex = hx + px2 * s + fx, ey = hy + py2 * s + fy;
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(ex + .5, ey + .5, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
      }
    }

    ctx.font = 'bold 12px Nunito,sans-serif';
    ctx.fillStyle = isMe ? '#3fb950' : '#e6edf3';
    ctx.textAlign = 'center'; ctx.shadowBlur = 4; ctx.shadowColor = '#00000090';
    const nameY = hy + (p.isNpc ? 28 : 24);
    ctx.fillText(p.name, hx, nameY); ctx.shadowBlur = 0;

    if (typeof p.hp === 'number' && typeof p.maxHp === 'number') {
      const barW = 40, barH = 6, barY = nameY + 8, pct = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = '#000'; ctx.fillRect(hx - barW / 2 - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = '#ff0000'; ctx.fillRect(hx - barW / 2, barY, barW, barH);
      ctx.fillStyle = '#00ff00'; ctx.fillRect(hx - barW / 2, barY, barW * pct, barH);
    }
  }
  ctx.restore();
}

// ── Color utils ───────────────────────────────────────────────────
function hexToRgb(hex) { const m = hex.replace('#', '').match(/.{2}/g); return m ? m.map(x => parseInt(x, 16)) : [128, 128, 128]; }
function adjustBrightness(hex, pct) { const [r, g, b] = hexToRgb(hex), f = pct / 100; return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`; }
function lightenColor(hex, amt = 40) { const [r, g, b] = hexToRgb(hex); return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`; }
function darkenColor(hex, pct) { const [r, g, b] = hexToRgb(hex), f = 1 - pct / 100; return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`; }

// ── Minimap ───────────────────────────────────────────────────────
function drawMinimap() {
  const W = minimapEl.width = 130, H = minimapEl.height = 130;
  const sx = W / worldW, sy = H / worldH;
  mmCtx.clearRect(0, 0, W, H);
  mmCtx.fillStyle = 'rgba(0,0,0,.8)'; mmCtx.fillRect(0, 0, W, H);
  for (const fid in foods) { const f = foods[fid]; mmCtx.fillStyle = f.color; mmCtx.fillRect(f.x * sx, f.y * sy, 1.5, 1.5); }
  for (const pid in players) { const p = players[pid]; if (!p.alive || !p.segments?.length) continue; if (p.invisible && pid !== myId) continue; const h = p.segments[0], isMe = pid === myId; mmCtx.beginPath(); mmCtx.arc(h.x * sx, h.y * sy, isMe ? 4 : 2.5, 0, Math.PI * 2); mmCtx.fillStyle = isMe ? '#3fb950' : p.color; mmCtx.fill(); }
  for (const fbid in fireballs) { const fb = fireballs[fbid]; mmCtx.fillStyle = '#ff6b00'; mmCtx.beginPath(); mmCtx.arc(fb.x * sx, fb.y * sy, 2.5, 0, Math.PI * 2); mmCtx.fill(); }
  for (const mid in mines) { const m = mines[mid]; mmCtx.fillStyle = '#ff0000'; mmCtx.beginPath(); mmCtx.arc(m.x * sx, m.y * sy, 3, 0, Math.PI * 2); mmCtx.fill(); }
  for (const a of apples) { mmCtx.fillStyle = '#ff3333'; mmCtx.beginPath(); mmCtx.arc(a.x * sx, a.y * sy, 3.5, 0, Math.PI * 2); mmCtx.fill(); }
  for (const a of greenApples) { mmCtx.fillStyle = '#32cd32'; mmCtx.beginPath(); mmCtx.arc(a.x * sx, a.y * sy, 3.5, 0, Math.PI * 2); mmCtx.fill(); }
  for (const ga of goldenApples) { mmCtx.fillStyle = '#ffea00'; mmCtx.beginPath(); mmCtx.arc(ga.x * sx, ga.y * sy, 5, 0, Math.PI * 2); mmCtx.fill(); }
  mmCtx.strokeStyle = 'rgba(255,255,255,.3)'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect((cameraX - canvas.width / 2) * sx, (cameraY - canvas.height / 2) * sy, canvas.width * sx, canvas.height * sy);
}

// ── Leaderboard ───────────────────────────────────────────────────
function updateLeaderboard() {
  lbRows.innerHTML = '';
  leaderboard.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (e.id === myId ? ' me' : '');
    row.innerHTML = `<span class="lb-rank">#${i + 1}</span><span class="lb-dot" style="background:${e.color}"></span><span class="lb-name">${e.name}</span><span class="lb-score">${e.score}</span>`;
    lbRows.appendChild(row);
  });
  const me = players[myId];
  if (me) scoreVal.textContent = Math.floor(me.score);
}

// ── Main loop ─────────────────────────────────────────────────────
function loop() {
  try {
    sendInput();
    const me = players[myId];
    if (me?.alive && me.segments?.length) {
      const h = me.segments[0];
      if (h && typeof h.x === 'number' && typeof h.y === 'number' && !isNaN(h.x) && !isNaN(h.y)) {
        if (isNaN(cameraX) || cameraX === 0) cameraX = h.x;
        if (isNaN(cameraY) || cameraY === 0) cameraY = h.y;
        cameraX += (h.x - cameraX) * 0.1;
        cameraY += (h.y - cameraY) * 0.1;
      }
    }
    if (isNaN(cameraX)) cameraX = worldW / 2;
    if (isNaN(cameraY)) cameraY = worldH / 2;

    drawBackground();
    drawWorldBorder();
    for (const fid in foods) drawFood(foods[fid]);
    for (const a of apples) drawApple(a);
    for (const a of greenApples) drawGreenApple(a);
    for (const ga of goldenApples) drawGoldenApple(ga);
    for (const port of portals) drawPortal(port);
    for (const pud of puddles) drawPuddle(pud);
    for (const L of larvas) drawLarva(L);
    for (const S of slugs) drawSlug(S);
    for (const W of worms) drawWorm(W);
    for (const r of rocks) drawRock(r);
    for (const A of ants) drawAnt(A);
    for (const pid in players) { if (pid !== myId) drawSnake(players[pid]); }
    if (myId && players[myId]) drawSnake(players[myId]);
    for (const fbid in fireballs) drawFireball(fireballs[fbid]);
    for (const mid in mines) drawMine(mines[mid]);
    for (const aid in arrows) drawArrow(arrows[aid]);
    updateAndDrawEffects();
    drawMinimap();
    updateLeaderboard();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error('❌ Error en bucle principal:', err);
    requestAnimationFrame(loop);
  }
}