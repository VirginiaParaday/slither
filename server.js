//Server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);

// ── Socket.IO config optimizada para Railway ──────────────────────
// Railway usa un proxy inverso (Nginx) que puede interferir con WebSocket.
// 1. transports polling primero: handshake HTTP funciona aunque el WS upgrade falle.
// 2. perMessageDeflate: false — evita que el proxy corrompa frames comprimidos.
// 3. httpCompression: false — sin gzip en respuestas HTTP de polling.
// 4. Sin compression() de Express — no comprimimos nada en el servidor.
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  allowEIO3: true,
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  perMessageDeflate: false,
  httpCompression: false
});

// Middleware
// FIX CRÍTICO: compression() ELIMINADO — en Railway comprime los frames WebSocket
// y el proxy los corrompe causando el error "Could not decode a text frame as UTF-8".
// Solo comprimimos rutas HTTP estáticas explícitamente si es necesario.
app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ────────────────────────────────────────────────────
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const TARGET_TICK_MS = 1000 / 30; // 33.33ms
const FOOD_COUNT = 400;
const SEGMENT_SPACING = 8;
const SNAKE_SPEED = 3.2;
const BOOST_SPEED = 6.0;
const SNAKE_RADIUS = 9;
const FOOD_RADIUS = 5;
const HEAD_RADIUS = 11;

// Viewport culling margin (px más allá de lo visible del cliente)
const VIEWPORT_HALF_W = 700;
const VIEWPORT_HALF_H = 500;
const VIEWPORT_MARGIN = 200; // extra margen de seguridad

// Apple constants
const APPLE_COUNT = 6;
const APPLE_RADIUS = 9;
const APPLE_LIFETIME = 600;
const PROTECTION_TIME = 250;

// Green Apple constants
const GREEN_APPLE_COUNT = 3;
const GREEN_APPLE_LIFETIME = 600;
const LETHAL_TIME = 250;

// Portal constants
const PORTAL_COUNT = 10;
const PORTAL_RADIUS = 35;
const PORTAL_LIFETIME = 600;

// Puddle constants
const PUDDLE_COUNT = 8;
const PUDDLE_RADIUS = 60;
const PUDDLE_LIFETIME = 600;
const PUDDLE_SLOW_TIME = 300;

// Larva constants
const LARVA_COUNT = 15;
const LARVA_RADIUS = 10;
const LARVA_SPEED = 1.2;
const LARVA_VALUE = 5;

// Slug constants
const SLUG_COUNT = 8;
const SLUG_RADIUS = 14;
const SLUG_SPEED = 0.7;
const SLUG_DAMAGE = 15;
const SLUG_HIT_COOLDOWN = 90;

// Earthworm constants
const WORM_COUNT = 10;
const WORM_SEGS = 12;
const WORM_RADIUS = 7;
const WORM_SPEED = 2.7;
const WORM_SEG_DIST = 10;
const WORM_VALUE = 10;

// Ant constants
const ANT_COUNT = 10;
const ANT_RADIUS = 10;
const ANT_SPEED = 3.5;
const ANT_DAMAGE = 25;
const ANT_DRAG_TICKS = 60;
const ANT_MOVE_TICKS = 25;
const ANT_PAUSE_TICKS = 15;
const ANT_HIT_COOLDOWN = 120;

// Fireball constants
const FIREBALL_SPEED = 9;
const FIREBALL_RADIUS = 10;
const FIREBALL_LIFETIME = 90;
const FIREBALL_DAMAGE = 8;
const MAX_AMMO = 5;
const AMMO_PER_FOOD = 1;

// Mine constants
const MINE_RADIUS = 12;
const MINE_LIFETIME = 120;
const MINE_DAMAGE = 10;
const MAX_MINES = 3;

// Rock constants
const ROCK_COUNT = 20;
const ROCK_RADIUS = 35;
const ROCK_RELOCATE_TICKS = 900;

// Arrow constants
const ARROW_SPEED = 14;
const ARROW_RADIUS = 8;
const ARROW_LIFETIME = 150;
const ARROW_COST = 5;
const ARROW_DAMAGE = 10;
const ARROW_MAX_AMMO = 5;
const ARROW_RECHARGE_SCORE = 5;

// ── State ────────────────────────────────────────────────────────
const players = {};
const foods = {};
const fireballs = {};
const mines = {};
const apples = {};
const greenApples = {};
const goldenApples = {};
const portals = {};
const puddles = {};
const larvas = {};
const slugs = {};
const worms = {};
const ants = {};
let foodId = 0;
let fireballId = 0;
let mineId = 0;
let appleId = 0;
let greenAppleId = 0;
let goldenAppleId = 0;
let goldenAppleSpawnTimer = 20 * 30;
let portalId = 0;
let puddleId = 0;
let larvaId = 0;
let slugId = 0;
let wormId = 0;
let antId = 0;
let rockId = 0;
const rocks = {};
let rockRelocateTimer = 0;
let staticChanged = true;
const BOSS_ID = 'boss_devorador';
const BOSS_DESTRUCTOR_ID = 'boss_destructor';
let destructorRespawnTimer = 0;
let arrowId = 0;
const arrows = {};
const pendingFood = [];

// FIX CRÍTICO: Variables hrtime eliminadas — ya no se usa el loop de alta precisión
// que bloqueaba el event loop en Railway. Se usa setInterval estándar.

// ── Helpers ──────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;

const COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#FF9FF3',
  '#54A0FF', '#5F27CD', '#00D2D3', '#1DD1A1', '#C44569',
  '#F8B739', '#EE5A24', '#009432', '#0652DD', '#9980FA',
  '#ED4C67', '#F79F1F', '#A3CB38', '#1289A7', '#C4E538'
];
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

// FIX #2: Función de viewport culling — filtra entidades fuera del area visible del jugador
function inViewport(px, py, entityX, entityY, margin = VIEWPORT_MARGIN) {
  return Math.abs(entityX - px) <= VIEWPORT_HALF_W + margin &&
    Math.abs(entityY - py) <= VIEWPORT_HALF_H + margin;
}

function spawnFood(id) {
  foods[id] = {
    id,
    x: Math.floor(rand(50, WORLD_WIDTH - 50)),
    y: Math.floor(rand(50, WORLD_HEIGHT - 50)),
    color: randomColor(),
    value: Math.random() < 0.15 ? 3 : 1,
    life: Math.floor(rand(300, 900))
  };
}
function spawnApple() {
  const id = appleId++;
  apples[id] = { id, x: rand(50, WORLD_WIDTH - 50), y: rand(50, WORLD_HEIGHT - 50), life: APPLE_LIFETIME };
}
function spawnGreenApple() {
  const id = greenAppleId++;
  greenApples[id] = { id, x: rand(50, WORLD_WIDTH - 50), y: rand(50, WORLD_HEIGHT - 50), life: GREEN_APPLE_LIFETIME };
}
function spawnGoldenApple() {
  const id = goldenAppleId++;
  goldenApples[id] = { id, x: rand(50, WORLD_WIDTH - 50), y: rand(50, WORLD_HEIGHT - 50), life: 9999999 };
}
function spawnPortal() {
  const id = portalId++;
  portals[id] = { id, x: rand(100, WORLD_WIDTH - 100), y: rand(100, WORLD_HEIGHT - 100), life: PORTAL_LIFETIME + rand(-30, 30) };
}
function spawnPuddle() {
  const id = puddleId++;
  puddles[id] = { id, x: rand(150, WORLD_WIDTH - 150), y: rand(150, WORLD_HEIGHT - 150), life: PUDDLE_LIFETIME + rand(-30, 30) };
}
function spawnLarva() {
  const id = larvaId++;
  larvas[id] = { id, x: rand(100, WORLD_WIDTH - 100), y: rand(100, WORLD_HEIGHT - 100), angle: rand(0, Math.PI * 2) };
}
function spawnSlug() {
  const id = slugId++;
  slugs[id] = { id, x: rand(150, WORLD_WIDTH - 150), y: rand(150, WORLD_HEIGHT - 150), angle: rand(0, Math.PI * 2) };
}
function spawnWorm() {
  const id = wormId++;
  const sx = rand(200, WORLD_WIDTH - 200);
  const sy = rand(200, WORLD_HEIGHT - 200);
  const angle = rand(0, Math.PI * 2);
  const segs = [];
  for (let i = 0; i < WORM_SEGS; i++) {
    segs.push({ x: sx - Math.cos(angle) * i * WORM_SEG_DIST, y: sy - Math.sin(angle) * i * WORM_SEG_DIST });
  }
  worms[id] = { id, segs, angle };
}
function initFood() {
  for (let i = 0; i < FOOD_COUNT; i++) spawnFood(foodId++);
  for (let i = 0; i < APPLE_COUNT; i++) spawnApple();
  for (let i = 0; i < GREEN_APPLE_COUNT; i++) spawnGreenApple();
  for (let i = 0; i < PORTAL_COUNT; i++) spawnPortal();
  for (let i = 0; i < PUDDLE_COUNT; i++) spawnPuddle();
  for (let i = 0; i < LARVA_COUNT; i++) spawnLarva();
  for (let i = 0; i < SLUG_COUNT; i++) spawnSlug();
  for (let i = 0; i < WORM_COUNT; i++) spawnWorm();
}

function spawnAnt() {
  const id = antId++;
  ants[id] = { id, x: rand(150, WORLD_WIDTH - 150), y: rand(150, WORLD_HEIGHT - 150), angle: rand(0, Math.PI * 2), moveTicks: ANT_MOVE_TICKS, pauseTicks: 0 };
}
function initAnts() { for (let i = 0; i < ANT_COUNT; i++) spawnAnt(); }

function spawnRocks() {
  for (let i = 0; i < ROCK_COUNT; i++) {
    const id = rockId++;
    rocks[id] = { id, x: rand(100, WORLD_WIDTH - 100), y: rand(100, WORLD_HEIGHT - 100), radius: ROCK_RADIUS + rand(-5, 5), rotation: rand(0, Math.PI * 2) };
  }
}
function relocateRocks() {
  for (const id in rocks) {
    rocks[id].x = rand(100, WORLD_WIDTH - 100);
    rocks[id].y = rand(100, WORLD_HEIGHT - 100);
    rocks[id].rotation = rand(0, Math.PI * 2);
  }
  staticChanged = true;
  console.log('🌑 Rocks relocated');
}
function initRocks() { spawnRocks(); }

function createPlayer(id, name, color, pattern) {
  const safeName = Array.from(name).slice(0, 15).join('');
  const isMaury = safeName.toLowerCase() === 'maury';
  const startX = rand(300, WORLD_WIDTH - 300);
  const startY = rand(300, WORLD_HEIGHT - 300);
  const segments = [];
  for (let i = 0; i < 10; i++) segments.push({ x: startX, y: startY + i * SEGMENT_SPACING });
  return {
    id, name: safeName,
    color: color || randomColor(),
    pattern: pattern || 'solid',
    segments, angle: -Math.PI / 2, targetAngle: -Math.PI / 2,
    score: isMaury ? 100 : 0,
    boosting: false, alive: true,
    length: isMaury ? 210 : 10,
    ammo: MAX_AMMO, maxAmmo: MAX_AMMO,
    mines: MAX_MINES, maxMines: MAX_MINES, mineCount: 0,
    protection: 0, lethal: 0, invisible: 0,
    portalCooldown: 0, entrancePortal: -1, exitPortal: -1,
    isNpc: false, slow: 0, arrowAmmo: 0, arrowRechargeProgress: 0
  };
}

function spawnNpc() {
  players[BOSS_ID] = createPlayer(BOSS_ID, 'El Devorador', '#8b0000', 'spiky');
  players[BOSS_ID].isNpc = true;
  players[BOSS_ID].length = 10;
  players[BOSS_ID].score = 0;
}

function spawnDestructor() {
  players[BOSS_DESTRUCTOR_ID] = createPlayer(BOSS_DESTRUCTOR_ID, 'El Destructor', '#3b0066', 'stripe');
  const npc = players[BOSS_DESTRUCTOR_ID];
  npc.isNpc = true; npc.isDestructor = true;
  npc.length = 15; npc.score = 15; npc.hp = 100; npc.maxHp = 100;
  npc.maxMines = 100; npc._fireCooldown = 60; npc._mineCooldown = 90;
}

function placeMine(playerId) {
  const p = players[playerId];
  if (!p || !p.alive) return null;
  if (p.mineCount >= MAX_MINES && !(p.invisible > 0)) return null;
  const tail = p.segments[p.segments.length - 1];
  const mid = mineId++;
  mines[mid] = { id: mid, ownerId: playerId, x: tail.x, y: tail.y, color: p.color, life: MINE_LIFETIME };
  p.mineCount++;
  return mines[mid];
}

function circlesOverlap(ax, ay, ar, bx, by, br) {
  return (ax - bx) ** 2 + (ay - by) ** 2 < (ar + br) ** 2;
}

// FIX #7: Caché de colisiones NPC-jugador para evitar O(n²) cada tick
// Cuadriculamos el mapa en celdas de 300px para búsqueda espacial rápida
const GRID_CELL = 300;
const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_CELL);
const GRID_ROWS = Math.ceil(WORLD_HEIGHT / GRID_CELL);
const spatialGrid = new Map();

function gridKey(cx, cy) { return cx * 1000 + cy; }

function buildSpatialGrid() {
  spatialGrid.clear();
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive || !p.segments.length) continue;
    const h = p.segments[0];
    const cx = Math.floor(h.x / GRID_CELL);
    const cy = Math.floor(h.y / GRID_CELL);
    const key = gridKey(cx, cy);
    if (!spatialGrid.has(key)) spatialGrid.set(key, []);
    spatialGrid.get(key).push(pid);
  }
}

// Devuelve jugadores en las 9 celdas vecinas de (wx, wy)
function getNearbyPlayers(wx, wy) {
  const cx = Math.floor(wx / GRID_CELL);
  const cy = Math.floor(wy / GRID_CELL);
  const result = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = gridKey(cx + dx, cy + dy);
      const cell = spatialGrid.get(key);
      if (cell) for (const pid of cell) result.push(pid);
    }
  }
  return result;
}

// ── Game tick ────────────────────────────────────────────────────
function gameTick() {
  if (destructorRespawnTimer > 0) {
    destructorRespawnTimer--;
    if (destructorRespawnTimer <= 0) spawnDestructor();
  }

  if (Object.keys(goldenApples).length === 0) {
    if (goldenAppleSpawnTimer > 0) {
      goldenAppleSpawnTimer--;
      if (goldenAppleSpawnTimer <= 0) { spawnGoldenApple(); staticChanged = true; }
    }
  }

  const deltaPlayers = {};
  const deltaFood = [...pendingFood];
  pendingFood.length = 0;
  const deaths = [];
  const fbHits = [];
  const shieldHits = [];

  // ── Portal expiration ───────────────────────────────────────────
  let portalCountCurrent = 0;
  for (const pid in portals) {
    portalCountCurrent++;
    portals[pid].life--;
    if (portals[pid].life <= 0) { delete portals[pid]; portalCountCurrent--; staticChanged = true; }
  }
  while (portalCountCurrent < PORTAL_COUNT) { spawnPortal(); portalCountCurrent++; staticChanged = true; }

  // ── Puddle expiration ───────────────────────────────────────────
  let puddleCountCurrent = 0;
  for (const pid in puddles) {
    puddleCountCurrent++;
    puddles[pid].life--;
    if (puddles[pid].life <= 0) { delete puddles[pid]; puddleCountCurrent--; staticChanged = true; }
  }
  while (puddleCountCurrent < PUDDLE_COUNT) { spawnPuddle(); puddleCountCurrent++; staticChanged = true; }

  // ── NPC Spawning & AI ──────────────────────────────────────────
  let activeNpcs = 0;
  for (const pid in players) { if (players[pid].isNpc && players[pid].alive) activeNpcs++; }
  if (activeNpcs < 1) spawnNpc();

  // FIX #7: Construir grid espacial antes del loop de NPC-aggro
  buildSpatialGrid();

  for (const pid in players) {
    const p = players[pid];
    if (!p.alive || !p.isNpc) continue;
    if (p.length > 40) p.length = 40;

    // FIX #7: Usar grid espacial en lugar de iterar todos los jugadores
    const nearby = getNearbyPlayers(p.segments[0].x, p.segments[0].y);
    let closestObj = null, closestDist = 250 * 250;
    for (const tId of nearby) {
      const target = players[tId];
      if (!target || target.id === p.id || target.isNpc || !target.alive) continue;
      const dx = target.segments[0].x - p.segments[0].x;
      const dy = target.segments[0].y - p.segments[0].y;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDist) { closestDist = distSq; closestObj = target; }
    }
    if (closestObj) {
      p.targetAngle = Math.atan2(closestObj.segments[0].y - p.segments[0].y, closestObj.segments[0].x - p.segments[0].x);
      p.boosting = true;
    } else {
      p.boosting = false;
      if (Math.random() < 0.05) p.targetAngle += rand(-Math.PI / 2, Math.PI / 2);
    }
  }

  // ── Green Apple expiration ──────────────────────────────────────
  let greenAppleCountCurrent = 0;
  for (const aid in greenApples) {
    greenAppleCountCurrent++;
    greenApples[aid].life--;
    if (greenApples[aid].life <= 0) { delete greenApples[aid]; greenAppleCountCurrent--; staticChanged = true; }
  }
  while (greenAppleCountCurrent < GREEN_APPLE_COUNT) { spawnGreenApple(); greenAppleCountCurrent++; staticChanged = true; }

  // ── Apple expiration ──────────────────────────────────────────
  let appleCountCurrent = 0;
  for (const aid in apples) {
    appleCountCurrent++;
    apples[aid].life--;
    if (apples[aid].life <= 0) { delete apples[aid]; appleCountCurrent--; staticChanged = true; }
  }
  while (appleCountCurrent < APPLE_COUNT) { spawnApple(); appleCountCurrent++; staticChanged = true; }

  // ── Food expiration ───────────────────────────────────────────
  let foodCountCurrent = 0;
  for (const fid in foods) {
    foodCountCurrent++;
    const f = foods[fid];
    if (f.life !== undefined) {
      f.life -= 1;
      if (f.life <= 0) { delete foods[fid]; deltaFood.push({ type: 'remove', id: fid }); foodCountCurrent--; }
    }
  }
  while (foodCountCurrent < FOOD_COUNT) {
    const nid = foodId++;
    spawnFood(nid);
    deltaFood.push({ type: 'add', food: foods[nid] });
    foodCountCurrent++;
  }

  // ── Larva Movement ─────────────────────────────────────────────
  let larvaCountCurrent = 0;
  for (const lid in larvas) {
    larvaCountCurrent++;
    const L = larvas[lid];
    if (Math.random() < 0.05) L.angle += rand(-0.4, 0.4);
    L.x += Math.cos(L.angle) * LARVA_SPEED;
    L.y += Math.sin(L.angle) * LARVA_SPEED;
    if (L.x < LARVA_RADIUS) { L.x = LARVA_RADIUS; L.angle = Math.PI - L.angle; }
    else if (L.x > WORLD_WIDTH - LARVA_RADIUS) { L.x = WORLD_WIDTH - LARVA_RADIUS; L.angle = Math.PI - L.angle; }
    if (L.y < LARVA_RADIUS) { L.y = LARVA_RADIUS; L.angle = -L.angle; }
    else if (L.y > WORLD_HEIGHT - LARVA_RADIUS) { L.y = WORLD_HEIGHT - LARVA_RADIUS; L.angle = -L.angle; }
  }
  while (larvaCountCurrent < LARVA_COUNT) { spawnLarva(); larvaCountCurrent++; }

  // ── Slug Movement ──────────────────────────────────────────────
  let slugCountCurrent = 0;
  for (const sid in slugs) {
    slugCountCurrent++;
    const S = slugs[sid];
    if (Math.random() < 0.03) S.angle += rand(-0.3, 0.3);
    S.x += Math.cos(S.angle) * SLUG_SPEED;
    S.y += Math.sin(S.angle) * SLUG_SPEED;
    if (S.x < SLUG_RADIUS) { S.x = SLUG_RADIUS; S.angle = Math.PI - S.angle; }
    else if (S.x > WORLD_WIDTH - SLUG_RADIUS) { S.x = WORLD_WIDTH - SLUG_RADIUS; S.angle = Math.PI - S.angle; }
    if (S.y < SLUG_RADIUS) { S.y = SLUG_RADIUS; S.angle = -S.angle; }
    else if (S.y > WORLD_HEIGHT - SLUG_RADIUS) { S.y = WORLD_HEIGHT - SLUG_RADIUS; S.angle = -S.angle; }
  }
  while (slugCountCurrent < SLUG_COUNT) { spawnSlug(); slugCountCurrent++; }

  // ── Worm Movement ──────────────────────────────────────────────
  let wormCountCurrent = 0;
  for (const wid in worms) {
    wormCountCurrent++;
    const W = worms[wid];
    if (Math.random() < 0.04) W.angle += rand(-0.35, 0.35);
    const head = W.segs[0];
    const nx = head.x + Math.cos(W.angle) * WORM_SPEED;
    const ny = head.y + Math.sin(W.angle) * WORM_SPEED;
    let na = W.angle;
    if (nx < WORM_RADIUS || nx > WORLD_WIDTH - WORM_RADIUS) na = Math.PI - na;
    if (ny < WORM_RADIUS || ny > WORLD_HEIGHT - WORM_RADIUS) na = -na;
    W.angle = na;
    const fnx = Math.max(WORM_RADIUS, Math.min(WORLD_WIDTH - WORM_RADIUS, nx));
    const fny = Math.max(WORM_RADIUS, Math.min(WORLD_HEIGHT - WORM_RADIUS, ny));
    W.segs.unshift({ x: fnx, y: fny });
    W.segs.pop();
  }
  while (wormCountCurrent < WORM_COUNT) { spawnWorm(); wormCountCurrent++; }

  // ── Ant Movement ──────────────────────────────────────────────
  for (const aid in ants) {
    const A = ants[aid];
    if (A.pauseTicks > 0) { A.pauseTicks--; continue; }
    if (Math.random() < 0.15) A.angle += rand(-Math.PI / 2, Math.PI / 2);
    A.x += Math.cos(A.angle) * ANT_SPEED;
    A.y += Math.sin(A.angle) * ANT_SPEED;
    if (A.x < ANT_RADIUS) { A.x = ANT_RADIUS; A.angle = Math.PI - A.angle; }
    else if (A.x > WORLD_WIDTH - ANT_RADIUS) { A.x = WORLD_WIDTH - ANT_RADIUS; A.angle = Math.PI - A.angle; }
    if (A.y < ANT_RADIUS) { A.y = ANT_RADIUS; A.angle = -A.angle; }
    else if (A.y > WORLD_HEIGHT - ANT_RADIUS) { A.y = WORLD_HEIGHT - ANT_RADIUS; A.angle = -A.angle; }
    A.moveTicks--;
    if (A.moveTicks <= 0) { A.moveTicks = ANT_MOVE_TICKS; A.pauseTicks = ANT_PAUSE_TICKS; A.angle += rand(-Math.PI * 0.75, Math.PI * 0.75); }
  }

  // ── Move players ──────────────────────────────────────────────
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;

    if (!p.isNpc && p.dragTicks === undefined) p.dragTicks = 0;
    if (!p.isNpc && p.dragTicks > 0) { p.dragTicks--; p.targetAngle = p.dragAngle; }

    let diff = p.targetAngle - p.angle;
    // FIX: Secure normalization (prevent floating point infinite while-loop)
    diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.10);

    const head = p.segments[0];

    if (p.slow > 0) p.slow--;
    for (const pid2 in puddles) {
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, puddles[pid2].x, puddles[pid2].y, PUDDLE_RADIUS)) {
        p.slow = PUDDLE_SLOW_TIME; break;
      }
    }

    let speed = (p.boosting && p.length > 10) ? BOOST_SPEED : SNAKE_SPEED;
    if (p.invisible > 0) { p.invisible--; speed *= 1.3; }
    if (p.slow > 0) speed *= 0.5;

    let nx = head.x + Math.cos(p.angle) * speed;
    let ny = head.y + Math.sin(p.angle) * speed;

    if (nx < HEAD_RADIUS || nx > WORLD_WIDTH - HEAD_RADIUS || ny < HEAD_RADIUS || ny > WORLD_HEIGHT - HEAD_RADIUS) {
      if (p.isNpc) {
        p.targetAngle += Math.PI; p.angle += Math.PI;
        nx = head.x + Math.cos(p.angle) * speed * 2;
        ny = head.y + Math.sin(p.angle) * speed * 2;
      } else {
        p.alive = false;
        deaths.push({ id: p.id, killedBy: null });
        for (let k = 0; k < p.segments.length; k += 3) {
          const fid = foodId++;
          foods[fid] = { id: fid, x: p.segments[k].x, y: p.segments[k].y, color: p.color, value: 1, life: rand(300, 900) };
          deltaFood.push({ type: 'add', food: foods[fid] });
        }
        continue;
      }
    }

    if (p.isDestructor) {
      if (Math.random() < 0.02) p.targetAngle = p.angle + rand(-Math.PI / 2, Math.PI / 2);
      p._fireCooldown--;
      if (p._fireCooldown <= 0) {
        p._fireCooldown = rand(90, 150);
        const fbid = fireballId++;
        fireballs[fbid] = {
          id: fbid, ownerId: p.id, color: p.color,
          x: head.x + Math.cos(p.angle) * (HEAD_RADIUS + FIREBALL_RADIUS + 2),
          y: head.y + Math.sin(p.angle) * (HEAD_RADIUS + FIREBALL_RADIUS + 2),
          angle: p.angle, life: FIREBALL_LIFETIME
        };
        // FIX #1: Sin JSON.stringify — Socket.IO serializa automáticamente
        io.emit('fireballSpawned', fireballs[fbid]);
      }
      p._mineCooldown--;
      if (p._mineCooldown <= 0) {
        p._mineCooldown = rand(150, 240);
        const mine = placeMine(p.id);
        if (mine) io.emit('mineSpawned', mine);
      }
    }

    p.segments.unshift({ x: nx, y: ny });
    const targetLen = Math.max(0, isNaN(p.length) ? 4 : p.length);
    while (p.segments.length > targetLen) {
      if (!p.segments.pop()) break;
    }

    if (p.protection > 0) p.protection--;
    if (p.lethal > 0) p.lethal--;
    if (p.portalCooldown > 0) p.portalCooldown--;

    if (p.portalCooldown <= 0) {
      const h = p.segments[0];
      for (const pid2 in portals) {
        const port = portals[pid2];
        if (circlesOverlap(h.x, h.y, HEAD_RADIUS, port.x, port.y, PORTAL_RADIUS)) {
          const others = Object.values(portals).filter(op => op.id !== port.id);
          if (others.length > 0) {
            const dest = others[Math.floor(Math.random() * others.length)];
            h.x = dest.x; h.y = dest.y;
            p.portalCooldown = 45;
            p.entrancePortal = port.id; p.exitPortal = dest.id;
            break;
          }
        }
      }
    }

    let isTraversing = false;
    for (let i = 0; i < p.segments.length - 1; i++) {
      const dx = p.segments[i].x - p.segments[i + 1].x;
      const dy = p.segments[i].y - p.segments[i + 1].y;
      if (dx * dx + dy * dy > 40000) { isTraversing = true; break; }
    }
    if (isTraversing && (!portals[p.entrancePortal] || !portals[p.exitPortal])) {
      p.alive = false;
      deaths.push({ id: p.id, killedBy: null });
      for (let k = 0; k < p.segments.length; k += 3) {
        const fid = foodId++;
        foods[fid] = { id: fid, x: p.segments[k].x, y: p.segments[k].y, color: p.color, value: 1, life: rand(300, 900) };
        deltaFood.push({ type: 'add', food: foods[fid] });
      }
      continue;
    }

    if (p.boosting && p.length > 10) {
      p.length -= 0.3; p.score = Math.max(0, p.score - 0.3);
      if (Math.random() < 0.3) {
        const fid = foodId++;
        foods[fid] = { id: fid, x: p.segments[p.segments.length - 1].x, y: p.segments[p.segments.length - 1].y, color: p.color, value: 1, life: rand(300, 900) };
        deltaFood.push({ type: 'add', food: foods[fid] });
      }
    }

    // FIX #6: Enviar solo cabeza en ticks normales, segmentos completos solo cada 2s.
    // Para el jugador propio se envía siempre la posición de la cabeza y len.
    // Los segmentos completos se mandan periódicamente como respaldo.
    const playerUpdate = {
      id: p.id, name: p.name, color: p.color, pattern: p.pattern,
      score: Math.floor(p.score), alive: p.alive, boosting: (p.boosting && p.length > 10),
      ammo: p.ammo, maxAmmo: p.maxAmmo,
      mines: MAX_MINES - p.mineCount, maxMines: MAX_MINES,
      protected: (p.protection > 0), lethal: (p.lethal > 0), invisible: (p.invisible > 0),
      isNpc: p.isNpc, isDestructor: p.isDestructor,
      hp: p.hp, maxHp: p.maxHp, slow: (p.slow > 0),
      len: p.segments.length, arrowAmmo: p.arrowAmmo
    };

    const now = Date.now();
    if (!p._lastSegmentsSent || (now - p._lastSegmentsSent > 2000)) {
      playerUpdate.segments = p.segments;
      p._lastSegmentsSent = now;
    } else {
      // FIX #6: Solo mandamos la cabeza; el cliente interpola el resto
      playerUpdate.head = p.segments[0];
    }

    deltaPlayers[pid] = playerUpdate;
  }

  // ── Food eating ───────────────────────────────────────────────
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;
    const head = p.segments[0];
    for (const fid in foods) {
      const f = foods[fid];
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, f.x, f.y, FOOD_RADIUS)) {
        p.score += f.value; p.length += f.value * 2;
        p.arrowRechargeProgress += f.value;
        if (p.arrowRechargeProgress >= ARROW_RECHARGE_SCORE) {
          const n = Math.floor(p.arrowRechargeProgress / ARROW_RECHARGE_SCORE);
          p.arrowAmmo = Math.min(ARROW_MAX_AMMO, p.arrowAmmo + n);
          p.arrowRechargeProgress %= ARROW_RECHARGE_SCORE;
        }
        if (p.ammo < p.maxAmmo) p.ammo = Math.min(p.maxAmmo, p.ammo + AMMO_PER_FOOD);
        delete foods[fid];
        deltaFood.push({ type: 'remove', id: fid });
      }
    }
    for (const lid in larvas) {
      const L = larvas[lid];
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, L.x, L.y, LARVA_RADIUS)) {
        p.score += LARVA_VALUE; p.length += LARVA_VALUE * 2;
        p.arrowRechargeProgress += LARVA_VALUE;
        if (p.arrowRechargeProgress >= ARROW_RECHARGE_SCORE) {
          const n = Math.floor(p.arrowRechargeProgress / ARROW_RECHARGE_SCORE);
          p.arrowAmmo = Math.min(ARROW_MAX_AMMO, p.arrowAmmo + n);
          p.arrowRechargeProgress %= ARROW_RECHARGE_SCORE;
        }
        delete larvas[lid];
      }
    }
    if (!p.isNpc) {
      for (const sid in slugs) {
        const S = slugs[sid];
        S._hitCooldown = S._hitCooldown || {};
        const cooldown = S._hitCooldown[p.id] || 0;
        if (cooldown > 0) { S._hitCooldown[p.id]--; continue; }
        for (let s = 0; s < p.segments.length; s++) {
          if (circlesOverlap(p.segments[s].x, p.segments[s].y, SNAKE_RADIUS + 2, S.x, S.y, SLUG_RADIUS)) {
            const dmg = Math.min(SLUG_DAMAGE, p.length - 4);
            if (dmg > 0) {
              p.length = Math.max(4, p.length - dmg); p.score = Math.max(0, p.score - dmg * 0.5);
              for (let k = 0; k < dmg * 2; k++) {
                const idx = p.segments.length - 1 - k;
                if (idx < 0) break;
                const fid = foodId++;
                foods[fid] = { id: fid, x: p.segments[idx].x, y: p.segments[idx].y, color: p.color, value: 1, life: rand(300, 600) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
            }
            S._hitCooldown[p.id] = SLUG_HIT_COOLDOWN; break;
          }
        }
      }
    }
    for (const wid in worms) {
      const W = worms[wid];
      for (let s = 0; s < W.segs.length; s++) {
        if (circlesOverlap(head.x, head.y, HEAD_RADIUS, W.segs[s].x, W.segs[s].y, WORM_RADIUS)) {
          p.score += WORM_VALUE; p.length += WORM_VALUE * 2;
          p.arrowRechargeProgress += WORM_VALUE;
          if (p.arrowRechargeProgress >= ARROW_RECHARGE_SCORE) {
            const n = Math.floor(p.arrowRechargeProgress / ARROW_RECHARGE_SCORE);
            p.arrowAmmo = Math.min(ARROW_MAX_AMMO, p.arrowAmmo + n);
            p.arrowRechargeProgress %= ARROW_RECHARGE_SCORE;
          }
          delete worms[wid]; break;
        }
      }
    }
    if (!p.isNpc) {
      for (const aid in ants) {
        const A = ants[aid];
        A._hitCooldown = A._hitCooldown || {};
        const cooldown = A._hitCooldown[p.id] || 0;
        if (cooldown > 0) { A._hitCooldown[p.id]--; continue; }
        if (p.invisible > 0) continue;
        if (circlesOverlap(head.x, head.y, HEAD_RADIUS, A.x, A.y, ANT_RADIUS)) {
          const dmg = Math.min(ANT_DAMAGE, p.length - 4);
          if (dmg > 0) {
            p.length = Math.max(4, p.length - dmg); p.score = Math.max(0, p.score - dmg * 0.5);
            for (let k = 0; k < dmg * 2; k++) {
              const idx = p.segments.length - 1 - k;
              if (idx < 0) break;
              const fid = foodId++;
              foods[fid] = { id: fid, x: p.segments[idx].x, y: p.segments[idx].y, color: p.color, value: 1, life: rand(300, 600) };
              deltaFood.push({ type: 'add', food: foods[fid] });
            }
          }
          p.dragAngle = A.angle; p.dragTicks = ANT_DRAG_TICKS;
          A._hitCooldown[p.id] = ANT_HIT_COOLDOWN;
        }
      }
    }
  }

  // ── Apple eating ──────────────────────────────────────────────
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;
    const head = p.segments[0];
    for (const aid in apples) {
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, apples[aid].x, apples[aid].y, APPLE_RADIUS)) {
        p.protection = PROTECTION_TIME; delete apples[aid]; spawnApple(); staticChanged = true;
      }
    }
    for (const gid in greenApples) {
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, greenApples[gid].x, greenApples[gid].y, APPLE_RADIUS)) {
        p.lethal = LETHAL_TIME; delete greenApples[gid]; spawnGreenApple(); staticChanged = true;
      }
    }
    for (const gaid in goldenApples) {
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, goldenApples[gaid].x, goldenApples[gaid].y, APPLE_RADIUS * 2)) {
        p.invisible = 25 * 30; delete goldenApples[gaid]; goldenAppleSpawnTimer = 15 * 30; staticChanged = true;
      }
    }
  }

  // ── Move & age fireballs ──────────────────────────────────────
  const fbDelta = [];
  for (const fbid in fireballs) {
    const fb = fireballs[fbid];
    fb.x += Math.cos(fb.angle) * FIREBALL_SPEED;
    fb.y += Math.sin(fb.angle) * FIREBALL_SPEED;
    fb.life -= 1;
    if (fb.life <= 0 || fb.x < 0 || fb.x > WORLD_WIDTH || fb.y < 0 || fb.y > WORLD_HEIGHT) {
      delete fireballs[fbid]; fbDelta.push({ type: 'remove', id: fbid }); continue;
    }
    let hit = false;
    for (const pid in players) {
      if (pid === fb.ownerId) continue;
      const target = players[pid];
      if (!target.alive || !target.segments?.length) continue;
      if (target.invisible > 0 && players[fb.ownerId]?.isNpc) continue;
      for (let s = 0; s < target.segments.length; s++) {
        const seg = target.segments[s];
        if (circlesOverlap(fb.x, fb.y, FIREBALL_RADIUS, seg.x, seg.y, SNAKE_RADIUS + 2)) {
          if (target.isDestructor) {
            target.hp -= 5;
            if (target.hp <= 0 && target.alive) {
              target.alive = false; deaths.push({ id: target.id, killedBy: fb.ownerId });
              const shooter = players[fb.ownerId];
              if (shooter) { shooter.score += 100; shooter.length += 200; }
              destructorRespawnTimer = 30 * 30;
              for (let k = 0; k < target.segments.length; k += 2) {
                const fid = foodId++;
                foods[fid] = { id: fid, x: target.segments[k].x, y: target.segments[k].y, color: target.color, value: 5, life: rand(300, 900) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
            }
            fbHits.push({ fbId: fbid, targetId: pid, x: fb.x, y: fb.y });
          } else if (target.protection > 0) {
            shieldHits.push({ x: fb.x, y: fb.y });
          } else {
            const dmg = Math.min(FIREBALL_DAMAGE, target.length - 4);
            if (dmg > 0) {
              target.length = Math.max(4, target.length - dmg); target.score = Math.max(0, target.score - dmg * 0.5);
              for (let k = 0; k < dmg * 2; k++) {
                const idx = target.segments.length - 1 - k;
                if (idx < 0) break;
                const fid = foodId++;
                foods[fid] = { id: fid, x: target.segments[idx].x, y: target.segments[idx].y, color: target.color, value: 1, life: rand(300, 900) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
              const shooter = players[fb.ownerId];
              if (shooter) {
                const gain = dmg * 0.5;
                shooter.score += gain;
                shooter.arrowRechargeProgress += gain;
                if (shooter.arrowRechargeProgress >= ARROW_RECHARGE_SCORE) {
                  const n = Math.floor(shooter.arrowRechargeProgress / ARROW_RECHARGE_SCORE);
                  shooter.arrowAmmo = Math.min(ARROW_MAX_AMMO, shooter.arrowAmmo + n);
                  shooter.arrowRechargeProgress %= ARROW_RECHARGE_SCORE;
                }
              }
            }
            fbHits.push({ fbId: fbid, targetId: pid, x: fb.x, y: fb.y });
          }
          delete fireballs[fbid]; fbDelta.push({ type: 'remove', id: fbid }); hit = true; break;
        }
      }
      if (hit) break;
    }
    if (!hit && fireballs[fbid]) {
      fbDelta.push({ type: 'update', fb: { id: fb.id, x: fb.x, y: fb.y, life: fb.life, angle: fb.angle, ownerId: fb.ownerId, color: fb.color } });
    }
  }

  // ── Snake-snake collisions ───────────────────────────────────
  const pids = Object.keys(players).filter(pid => players[pid].alive);
  for (let i = 0; i < pids.length; i++) {
    for (let j = 0; j < pids.length; j++) {
      if (i === j) continue;
      const pa = players[pids[i]], pb = players[pids[j]];
      if (!pa.alive || !pb.alive) continue;
      if (pa.isNpc && pb.isNpc) continue;
      if ((pa.isNpc && pb.invisible > 0) || (pb.isNpc && pa.invisible > 0)) continue;
      const headA = pa.segments[0];
      const startSeg = pb.isNpc ? 0 : 2;
      for (let s = startSeg; s < pb.segments.length; s++) {
        const seg = pb.segments[s];
        const hitRad = SNAKE_RADIUS + (pb.isNpc ? 4 : 0);
        if (circlesOverlap(headA.x, headA.y, HEAD_RADIUS - 2, seg.x, seg.y, hitRad)) {
          const killer = pa.isNpc ? pb : (pb.isNpc ? pa : null);
          const victim = pa.isNpc ? pb : (pb.isNpc ? pa : (pa.lethal > 0 ? pb : pa));
          const victimId = victim.id;
          victim.alive = false;
          deaths.push({ id: victimId, killedBy: pa.isNpc ? pa.id : pb.id });
          for (let k = 0; k < victim.segments.length; k += 3) {
            const fid = foodId++;
            foods[fid] = { id: fid, x: victim.segments[k].x, y: victim.segments[k].y, color: victim.color, value: 1, life: rand(300, 900) };
            deltaFood.push({ type: 'add', food: foods[fid] });
          }
          break;
        }
      }
    }
  }

  // ── Mine collisions ───────────────────────────────────────────
  const mineDelta = [];
  const mineHits = [];
  for (const mid in mines) {
    const m = mines[mid];
    m.life -= 1;
    if (m.life <= 0) {
      delete mines[mid];
      const owner = players[m.ownerId]; if (owner) owner.mineCount--;
      mineDelta.push({ type: 'remove', id: mid }); continue;
    }
    let hit = false;
    for (const pid in players) {
      if (pid === m.ownerId) continue;
      const target = players[pid];
      if (!target.alive || !target.segments?.length) continue;
      if (target.invisible > 0 && players[m.ownerId]?.isNpc) continue;
      for (let s = 0; s < target.segments.length; s++) {
        if (circlesOverlap(m.x, m.y, MINE_RADIUS, target.segments[s].x, target.segments[s].y, SNAKE_RADIUS + 2)) {
          if (target.protection > 0) {
            shieldHits.push({ x: m.x, y: m.y });
          } else {
            const dmg = Math.min(MINE_DAMAGE, target.length - 4);
            if (dmg > 0) {
              target.length = Math.max(4, target.length - dmg); target.score = Math.max(0, target.score - dmg * 0.5);
              for (let k = 0; k < dmg * 2; k++) {
                const idx = target.segments.length - 1 - k;
                if (idx < 0) break;
                const fid = foodId++;
                foods[fid] = { id: fid, x: target.segments[idx].x, y: target.segments[idx].y, color: target.color, value: 1, life: rand(300, 900) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
            }
            mineHits.push({ mineId: mid, targetId: pid, x: m.x, y: m.y });
          }
          delete mines[mid];
          const owner = players[m.ownerId]; if (owner) owner.mineCount--;
          mineDelta.push({ type: 'remove', id: mid }); hit = true; break;
        }
      }
      if (hit) break;
    }
    if (!hit && mines[mid]) {
      mineDelta.push({ type: 'update', mine: { id: m.id, x: m.x, y: m.y, life: m.life, color: m.color, ownerId: m.ownerId } });
    }
  }

  // ── Leaderboard ───────────────────────────────────────────────
  const leaderboard = Object.values(players)
    .sort((a, b) => b.score - a.score).slice(0, 10)
    .map(p => ({ id: p.id, name: p.name, score: Math.floor(p.score), color: p.color, alive: p.alive }));

  // ── Rock collisions & Timer ──────────────────────────────────
  rockRelocateTimer++;
  let rocksChanged = false;
  if (rockRelocateTimer >= ROCK_RELOCATE_TICKS) {
    rockRelocateTimer = 0; relocateRocks(); rocksChanged = true;
  }
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive || p.isNpc) continue;
    const h = p.segments[0];
    for (const rid in rocks) {
      const r = rocks[rid];
      if (circlesOverlap(h.x, h.y, HEAD_RADIUS - 2, r.x, r.y, r.radius - 5)) {
        p.alive = false; deaths.push({ id: p.id, killedBy: 'obstáculo_piedra' });
        for (let k = 0; k < p.segments.length; k += 3) {
          const fid = foodId++;
          foods[fid] = { id: fid, x: p.segments[k].x, y: p.segments[k].y, color: p.color, value: 1, life: rand(300, 900) };
          deltaFood.push({ type: 'add', food: foods[fid] });
        }
        break;
      }
    }
  }

  // ── Arrow updates ─────────────────────────────────────────────
  const arrowDelta = [];
  for (const aid in arrows) {
    const a = arrows[aid];
    a.x += Math.cos(a.angle) * ARROW_SPEED;
    a.y += Math.sin(a.angle) * ARROW_SPEED;
    a.life--;
    if (a.life <= 0 || a.x < 0 || a.x > WORLD_WIDTH || a.y < 0 || a.y > WORLD_HEIGHT) {
      delete arrows[aid]; arrowDelta.push({ type: 'remove', id: aid }); continue;
    }
    let hit = false;
    for (const pid in players) {
      if (pid === a.ownerId) continue;
      const target = players[pid];
      if (!target.alive || !target.segments?.length) continue;
      for (let s = 0; s < target.segments.length; s++) {
        const seg = target.segments[s];
        if (circlesOverlap(a.x, a.y, ARROW_RADIUS, seg.x, seg.y, s === 0 ? HEAD_RADIUS : SNAKE_RADIUS)) {
          if (target.isDestructor) {
            target.hp -= 10;
            if (target.hp <= 0 && target.alive) {
              target.alive = false; deaths.push({ id: target.id, killedBy: a.ownerId });
              const shooter = players[a.ownerId];
              if (shooter) { shooter.score += 100; shooter.length += 200; }
              destructorRespawnTimer = 30 * 30;
              for (let k = 0; k < target.segments.length; k += 2) {
                const fid = foodId++;
                foods[fid] = { id: fid, x: target.segments[k].x, y: target.segments[k].y, color: target.color, value: 5, life: rand(300, 900) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
            }
            // FIX #1: Sin JSON.stringify
            io.emit('arrowHit', { x: a.x, y: a.y, targetId: pid });
          } else {
            const dmg = Math.min(ARROW_DAMAGE, target.length - 4);
            if (dmg > 0) {
              target.length = Math.max(4, target.length - dmg);
              target.score = Math.max(0, target.score - dmg * 0.5);
              for (let k = 0; k < dmg * 2; k++) {
                const idx = target.segments.length - 1 - k;
                if (idx < 0) break;
                const fid = foodId++;
                foods[fid] = { id: fid, x: target.segments[idx].x, y: target.segments[idx].y, color: target.color, value: 1, life: rand(300, 900) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
            }
            io.emit('arrowHit', { x: a.x, y: a.y, targetId: pid });
          }
          delete arrows[aid]; arrowDelta.push({ type: 'remove', id: aid }); hit = true; break;
        }
      }
      if (hit) break;
    }
    if (!hit) {
      arrowDelta.push({ type: 'update', arrow: { id: a.id, x: a.x, y: a.y, angle: a.angle, ownerId: a.ownerId } });
    }
  }

  // ── Construir paquete base (sin datos por jugador) ────────────
  const basePacket = {
    foodChanges: deltaFood,
    leaderboard,
    fbDelta, fbHits,
    mineDelta, mineHits,
    shieldHits,
    // FIX #2: larvas/slugs/worms/ants se incluyen en el paquete base.
    // El culling por viewport se hace por-socket abajo.
    larvas: Object.values(larvas),
    slugs: Object.values(slugs),
    worms: Object.values(worms).map(w => ({ id: w.id, head: w.segs[0], len: w.segs.length, angle: w.angle })),
    ants: Object.values(ants),
    arrowDelta
  };

  if (staticChanged) {
    basePacket.apples = Object.values(apples);
    basePacket.greenApples = Object.values(greenApples);
    basePacket.goldenApples = Object.values(goldenApples);
    basePacket.portals = Object.values(portals);
    basePacket.puddles = Object.values(puddles);
    staticChanged = false;
  }
  if (rocksChanged) {
    basePacket.rocks = Object.values(rocks);
  }

  // FIX BLOQUEO: Solo enviamos tick a sockets con jugador activo.
  // Antes se mandaba tick completo a TODOS los sockets (incluyendo conexiones
  // fantasma de polling de Railway), saturando memoria y matando el proceso.
  for (const [sid, socket] of io.sockets.sockets) {
    const p = players[sid];

    // Ignorar sockets sin join o muertos — no necesitan tick
    if (!p || !p.alive || !p.segments.length) continue;

    const px = p.segments[0].x;
    const py = p.segments[0].y;

    const visiblePlayers = {};
    for (const pid in deltaPlayers) {
      const dp = deltaPlayers[pid];
      if (pid === sid) { visiblePlayers[pid] = dp; continue; }
      const hx = dp.head ? dp.head.x : (dp.segments ? dp.segments[0]?.x : null);
      const hy = dp.head ? dp.head.y : (dp.segments ? dp.segments[0]?.y : null);
      if (hx == null || !inViewport(px, py, hx, hy)) continue;
      visiblePlayers[pid] = dp;
    }

    const packet = {
      ...basePacket,
      players: visiblePlayers,
      larvas: basePacket.larvas.filter(e => inViewport(px, py, e.x, e.y)),
      slugs: basePacket.slugs.filter(e => inViewport(px, py, e.x, e.y)),
      worms: basePacket.worms.filter(e => e.head && inViewport(px, py, e.head.x, e.head.y)),
      ants: basePacket.ants.filter(e => inViewport(px, py, e.x, e.y)),
    };

    socket.emit('tick', packet);
  }

  // Notificar muertes individualmente (sin culling — son mensajes críticos)
  for (const d of deaths) io.to(d.id).emit('died', { killedBy: d.killedBy });
}

// ── Socket.IO ────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('join', raw => {
    // FIX CRÍTICO: Mantener fallback por compatibilidad pero ya llega como objeto nativo
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { name, color, pattern } = data || {};
    const sanitizedName = Array.from(String(name || 'Snake'))
      .filter(char => char.codePointAt(0) > 31)
      .slice(0, 15).join('');

    const player = createPlayer(socket.id, sanitizedName, color, pattern);
    players[socket.id] = player;

    // Enviar solo las 200 comidas más cercanas al spawn (reduce tamaño del init)
    const foodList = Object.values(foods)
      .map(f => ({ id: f.id, x: f.x, y: f.y, v: f.value, d: (f.x - player.segments[0].x) ** 2 + (f.y - player.segments[0].y) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, 200)
      .map(f => [f.id, f.x, f.y, f.v]);

    // FIX CRÍTICO: Sin JSON.stringify — consistencia con todos los demás eventos
    socket.emit('init', {
      id: socket.id,
      foods: foodList,
      players: Object.values(players).map(p => ({
        id: p.id, name: p.name, color: p.color, pattern: p.pattern,
        segments: p.id === socket.id ? p.segments : [p.segments[0]],
        score: Math.floor(p.score), alive: p.alive, isNpc: p.isNpc
      })),
      worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT,
      apples: Object.values(apples),
      greenApples: Object.values(greenApples),
      goldenApples: Object.values(goldenApples),
      portals: Object.values(portals),
      puddles: Object.values(puddles),
      larvas: Object.values(larvas),
      slugs: Object.values(slugs),
      worms: Object.values(worms).map(w => ({ id: w.id, head: w.segs[0], len: w.segs.length, angle: w.angle })),
      ants: Object.values(ants),
      rocks: Object.values(rocks),
      arrows: Object.values(arrows)
    });

    console.log(`🚀 Init sent to ${socket.id} (${foodList.length} foods)`);
    io.emit('playerJoined', { id: socket.id, name: player.name });
  });

  socket.on('input', data => {
    // FIX CRÍTICO: Sin JSON.stringify en cliente ni en servidor — objeto nativo
    if (typeof data === 'string') data = JSON.parse(data);
    const { angle, boosting } = data || {};
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (typeof angle === 'number' && isFinite(angle)) p.targetAngle = angle;
    if (typeof boosting === 'boolean') p.boosting = boosting;
  });

  socket.on('fireball', () => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (p.ammo <= 0 && !(p.invisible > 0)) return;
    if (!(p.invisible > 0)) p.ammo--;
    const head = p.segments[0];
    const fbid = fireballId++;
    fireballs[fbid] = {
      id: fbid, ownerId: socket.id, color: p.color,
      x: head.x + Math.cos(p.angle) * (HEAD_RADIUS + FIREBALL_RADIUS + 2),
      y: head.y + Math.sin(p.angle) * (HEAD_RADIUS + FIREBALL_RADIUS + 2),
      angle: p.angle, life: FIREBALL_LIFETIME
    };
    io.emit('fireballSpawned', fireballs[fbid]);
  });

  socket.on('mine', () => {
    const mine = placeMine(socket.id);
    if (mine) io.emit('mineSpawned', mine);
  });

  socket.on('arrow', () => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    const isGolden = p.invisible > 0;
    if (!isGolden && (p.score < 50 || p.arrowAmmo <= 0)) return;
    if (!isGolden) {
      p.arrowAmmo--;
      p.score = Math.max(0, p.score - ARROW_COST);
      p.length = Math.max(4, p.length - ARROW_COST * 2);
    }
    if (!isGolden) {
      for (let k = 0; k < ARROW_COST * 2; k += 2) {
        if (p.segments.length > 4) {
          const tail = p.segments.pop();
          if (!tail) break;
          const fid = foodId++;
          foods[fid] = { id: fid, x: tail.x, y: tail.y, color: p.color, value: 1, life: rand(300, 900) };
          pendingFood.push({ type: 'add', food: foods[fid] });
        }
      }
    }
    const head = p.segments[0];
    const aid = arrowId++;
    arrows[aid] = { id: aid, ownerId: socket.id, x: head.x + Math.cos(p.angle) * 20, y: head.y + Math.sin(p.angle) * 20, angle: p.angle, life: ARROW_LIFETIME };
    io.emit('arrowSpawned', arrows[aid]);
  });

  socket.on('respawn', raw => {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { color, pattern } = data || {};
    const p = players[socket.id];
    if (!p) return;
    players[socket.id] = createPlayer(socket.id, p.name, color || p.color, pattern || p.pattern);
    socket.emit('respawned', { player: players[socket.id] });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
  });
});

// ── Boot ─────────────────────────────────────────────────────────
// FIX CRÍTICO: scheduleNextTick con setImmediate en loop continuo bloqueaba
// el event loop de Node.js en Railway, impidiendo que Socket.IO procesara
// mensajes entrantes. Volvemos a setInterval simple y estable.
initFood();
initAnts();
initRocks();
spawnNpc();
spawnDestructor();
setInterval(gameTick, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐍 Slither server → http://localhost:${PORT}`));