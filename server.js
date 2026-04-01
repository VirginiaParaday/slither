const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ────────────────────────────────────────────────────
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const TICK_RATE = 1000 / 30;
const FOOD_COUNT = 400;
const SEGMENT_SPACING = 8;
const SNAKE_SPEED = 3.2;
const BOOST_SPEED = 6.0;
const SNAKE_RADIUS = 9;
const FOOD_RADIUS = 5;
const HEAD_RADIUS = 11;

// Apple constants
const APPLE_COUNT = 6;
const APPLE_RADIUS = 9;
const APPLE_LIFETIME = 600;    // 10s at 30fps
const PROTECTION_TIME = 250;    // 5s at 30fps

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
const SLUG_HIT_COOLDOWN = 90; // ticks between hits (~3 sec)

// Earthworm constants
const WORM_COUNT = 10;
const WORM_SEGS = 12;
const WORM_RADIUS = 7;
const WORM_SPEED = 2.7;
const WORM_SEG_DIST = 10;
const WORM_VALUE = 10; // double larva

// Ant constants
const ANT_COUNT = 10;
const ANT_RADIUS = 10;
const ANT_SPEED = 3.5;
const ANT_DAMAGE = 25;
const ANT_DRAG_TICKS = 60;
const ANT_MOVE_TICKS = 25; // ticks moving per burst
const ANT_PAUSE_TICKS = 15; // ticks pausing per burst
const ANT_HIT_COOLDOWN = 120;

// Fireball constants
const FIREBALL_SPEED = 9;      // px/tick
const FIREBALL_RADIUS = 10;
const FIREBALL_LIFETIME = 90;     // ticks (~3 seconds at 30fps)
const FIREBALL_DAMAGE = 8;      // segments removed on hit
const MAX_AMMO = 5;
const AMMO_PER_FOOD = 1;      // ammo recharged per food eaten

// Mine constants
const MINE_RADIUS = 12;
const MINE_LIFETIME = 120;    // ticks (~4 seconds at 30fps)
const MINE_DAMAGE = 10;     // segments removed on hit
const MAX_MINES = 3;      // max mines a player can have active

// ── State ────────────────────────────────────────────────────────
const players = {};
const foods = {};
const fireballs = {};   // { [id]: Fireball }
const mines = {};   // { [id]: Mine }
const apples = {};   // { [id]: Apple }
const greenApples = {}; // { [id]: GreenApple }
const portals = {}; // { [id]: Portal }
const puddles = {}; // { [id]: Puddle }
const larvas = {};  // { [id]: Larva }
const slugs  = {};  // { [id]: Slug }
const worms  = {};  // { [id]: Worm }
const ants   = {};  // { [id]: Ant }
let foodId = 0;
let fireballId = 0;
let mineId = 0;
let appleId = 0;
let greenAppleId = 0;
let portalId = 0;
let puddleId = 0;
let larvaId = 0;
let slugId = 0;
let wormId = 0;
let antId = 0;

// ── Helpers ──────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;

const COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#FF9FF3',
  '#54A0FF', '#5F27CD', '#00D2D3', '#1DD1A1', '#C44569',
  '#F8B739', '#EE5A24', '#009432', '#0652DD', '#9980FA',
  '#ED4C67', '#F79F1F', '#A3CB38', '#1289A7', '#C4E538'
];
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

function spawnFood(id) {
  foods[id] = {
    id,
    x: rand(50, WORLD_WIDTH - 50),
    y: rand(50, WORLD_HEIGHT - 50),
    color: randomColor(),
    value: Math.random() < 0.15 ? 3 : 1,
    life: rand(300, 900)
  };
}
function spawnApple() {
  const id = appleId++;
  apples[id] = {
    id,
    x: rand(50, WORLD_WIDTH - 50),
    y: rand(50, WORLD_HEIGHT - 50),
    life: APPLE_LIFETIME
  };
}
function spawnGreenApple() {
  const id = greenAppleId++;
  greenApples[id] = {
    id,
    x: rand(50, WORLD_WIDTH - 50),
    y: rand(50, WORLD_HEIGHT - 50),
    life: GREEN_APPLE_LIFETIME
  };
}
function spawnPortal() {
  const id = portalId++;
  portals[id] = {
    id,
    x: rand(100, WORLD_WIDTH - 100),
    y: rand(100, WORLD_HEIGHT - 100),
    life: PORTAL_LIFETIME + rand(-30, 30) // slight variance so not all pop instantly
  };
}
function spawnPuddle() {
  const id = puddleId++;
  puddles[id] = {
    id,
    x: rand(150, WORLD_WIDTH - 150),
    y: rand(150, WORLD_HEIGHT - 150),
    life: PUDDLE_LIFETIME + rand(-30, 30)
  };
}
function spawnLarva() {
  const id = larvaId++;
  larvas[id] = {
    id,
    x: rand(100, WORLD_WIDTH - 100),
    y: rand(100, WORLD_HEIGHT - 100),
    angle: rand(0, Math.PI * 2)
  };
}
function spawnSlug() {
  const id = slugId++;
  slugs[id] = {
    id,
    x: rand(150, WORLD_WIDTH - 150),
    y: rand(150, WORLD_HEIGHT - 150),
    angle: rand(0, Math.PI * 2)
  };
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
  ants[id] = {
    id,
    x: rand(150, WORLD_WIDTH - 150),
    y: rand(150, WORLD_HEIGHT - 150),
    angle: rand(0, Math.PI * 2),
    moveTicks: ANT_MOVE_TICKS,
    pauseTicks: 0
  };
}
function initAnts() {
  for (let i = 0; i < ANT_COUNT; i++) spawnAnt();
}

function createPlayer(id, name, color, pattern) {
  const startX = rand(300, WORLD_WIDTH - 300);
  const startY = rand(300, WORLD_HEIGHT - 300);
  const segments = [];
  for (let i = 0; i < 10; i++) segments.push({ x: startX, y: startY + i * SEGMENT_SPACING });
  return {
    id,
    name: name.slice(0, 20) || 'Snake',
    color: color || randomColor(),
    pattern: pattern || 'solid',
    segments,
    angle: -Math.PI / 2,
    targetAngle: -Math.PI / 2,
    score: 0,
    boosting: false,
    alive: true,
    length: 10,
    ammo: MAX_AMMO,      // current fireball charges
    maxAmmo: MAX_AMMO,
    mines: MAX_MINES,
    maxMines: MAX_MINES,
    mineCount: 0,             // active mines placed by this player
    protection: 0,             // shield ticks remaining
    lethal: 0,                 // lethal ticks remaining
    portalCooldown: 0,
    entrancePortal: -1,
    exitPortal: -1,
    isNpc: false,
    slow: 0
  };
}

function spawnNpc() {
  const npcId = 'npc_' + Date.now();
  players[npcId] = createPlayer(npcId, 'El Devorador', '#8b0000', 'spiky');
  const npc = players[npcId];
  npc.isNpc = true;
  npc.length = 10;
  npc.score = 0;
}

function placeMine(playerId) {
  const p = players[playerId];
  if (!p || !p.alive || p.mineCount >= MAX_MINES) return null;

  const tail = p.segments[p.segments.length - 1];
  const mid = mineId++;
  mines[mid] = {
    id: mid,
    ownerId: playerId,
    x: tail.x,
    y: tail.y,
    color: p.color,
    life: MINE_LIFETIME
  };
  p.mineCount++;
  return mines[mid];
}

function circlesOverlap(ax, ay, ar, bx, by, br) {
  return (ax - bx) ** 2 + (ay - by) ** 2 < (ar + br) ** 2;
}

// ── Game tick ────────────────────────────────────────────────────
function gameTick() {
  const deltaFood = [];
  const deltaPlayers = {};
  const deaths = [];
  const fbHits = [];     // { fbId, targetId }
  const shieldHits = [];     // { x, y }

  // ── Portal expiration ───────────────────────────────────────────
  let portalCountCurrent = 0;
  for (const pid in portals) {
    portalCountCurrent++;
    portals[pid].life--;
    if (portals[pid].life <= 0) {
      delete portals[pid];
      portalCountCurrent--;
    }
  }
  while (portalCountCurrent < PORTAL_COUNT) {
    spawnPortal();
    portalCountCurrent++;
  }

  // ── Puddle expiration ───────────────────────────────────────────
  let puddleCountCurrent = 0;
  for (const pid in puddles) {
    puddleCountCurrent++;
    puddles[pid].life--;
    if (puddles[pid].life <= 0) {
      delete puddles[pid];
      puddleCountCurrent--;
    }
  }
  while (puddleCountCurrent < PUDDLE_COUNT) {
    spawnPuddle();
    puddleCountCurrent++;
  }

  // ── NPC Spawning & AI ──────────────────────────────────────────
  let activeNpcs = 0;
  for (const pid in players) {
    if (players[pid].isNpc && players[pid].alive) activeNpcs++;
  }
  if (activeNpcs < 1) spawnNpc();

  for (const pid in players) {
    const p = players[pid];
    if (!p.alive || !p.isNpc) continue;
    
    if (p.length > 40) p.length = 40; // Max length limit 40
    
    let closestObj = null, closestDist = 250 * 250; // Aggro range: 250
    for (const tId in players) {
      const target = players[tId];
      if (target.id === p.id || target.isNpc || !target.alive) continue;
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
      if (Math.random() < 0.05) p.targetAngle += rand(-Math.PI/2, Math.PI/2);
    }
  }

  // ── Green Apple expiration ──────────────────────────────────────
  let greenAppleCountCurrent = 0;
  for (const aid in greenApples) {
    greenAppleCountCurrent++;
    greenApples[aid].life--;
    if (greenApples[aid].life <= 0) {
      delete greenApples[aid];
      greenAppleCountCurrent--;
    }
  }
  while (greenAppleCountCurrent < GREEN_APPLE_COUNT) {
    spawnGreenApple();
    greenAppleCountCurrent++;
  }

  // ── Apple expiration ──────────────────────────────────────────
  let appleCountCurrent = 0;
  for (const aid in apples) {
    appleCountCurrent++;
    apples[aid].life--;
    if (apples[aid].life <= 0) {
      delete apples[aid];
      appleCountCurrent--;
    }
  }
  while (appleCountCurrent < APPLE_COUNT) {
    spawnApple();
    appleCountCurrent++;
  }

  // ── Food expiration ───────────────────────────────────────────
  let foodCountCurrent = 0;
  for (const fid in foods) {
    foodCountCurrent++;
    const f = foods[fid];
    if (f.life !== undefined) {
      f.life -= 1;
      if (f.life <= 0) {
        delete foods[fid];
        deltaFood.push({ type: 'remove', id: fid });
        foodCountCurrent--;
      }
    }
  }

  // Spawn new ambient food if below threshold
  while (foodCountCurrent < FOOD_COUNT) {
    const nid = foodId++;
    spawnFood(nid);
    deltaFood.push({ type: 'add', food: foods[nid] });
    foodCountCurrent++;
  }

  // ── Larva Movement & Spawning ─────────────────────────────────
  let larvaCountCurrent = 0;
  for (const lid in larvas) {
    larvaCountCurrent++;
    const L = larvas[lid];
    if (Math.random() < 0.05) L.angle += rand(-0.4, 0.4);
    L.x += Math.cos(L.angle) * LARVA_SPEED;
    L.y += Math.sin(L.angle) * LARVA_SPEED;
    
    // Bounce walls
    if (L.x < LARVA_RADIUS) { L.x = LARVA_RADIUS; L.angle = Math.PI - L.angle; }
    else if (L.x > WORLD_WIDTH - LARVA_RADIUS) { L.x = WORLD_WIDTH - LARVA_RADIUS; L.angle = Math.PI - L.angle; }
    if (L.y < LARVA_RADIUS) { L.y = LARVA_RADIUS; L.angle = -L.angle; }
    else if (L.y > WORLD_HEIGHT - LARVA_RADIUS) { L.y = WORLD_HEIGHT - LARVA_RADIUS; L.angle = -L.angle; }
  }
  while (larvaCountCurrent < LARVA_COUNT) {
    spawnLarva();
    larvaCountCurrent++;
  }

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
  while (slugCountCurrent < SLUG_COUNT) {
    spawnSlug();
    slugCountCurrent++;
  }

  // ── Worm Movement ──────────────────────────────────────────────
  let wormCountCurrent = 0;
  for (const wid in worms) {
    wormCountCurrent++;
    const W = worms[wid];
    if (Math.random() < 0.04) W.angle += rand(-0.35, 0.35);
    const head = W.segs[0];
    const nx = head.x + Math.cos(W.angle) * WORM_SPEED;
    const ny = head.y + Math.sin(W.angle) * WORM_SPEED;
    // wall bounce
    let na = W.angle;
    if (nx < WORM_RADIUS || nx > WORLD_WIDTH - WORM_RADIUS) na = Math.PI - na;
    if (ny < WORM_RADIUS || ny > WORLD_HEIGHT - WORM_RADIUS) na = -na;
    W.angle = na;
    const fnx = Math.max(WORM_RADIUS, Math.min(WORLD_WIDTH - WORM_RADIUS, nx));
    const fny = Math.max(WORM_RADIUS, Math.min(WORLD_HEIGHT - WORM_RADIUS, ny));
    W.segs.unshift({ x: fnx, y: fny });
    W.segs.pop();
  }
  while (wormCountCurrent < WORM_COUNT) {
    spawnWorm();
    wormCountCurrent++;
  }

  // ── Ant Movement ──────────────────────────────────────────────
  for (const aid in ants) {
    const A = ants[aid];
    if (A.pauseTicks > 0) {
      A.pauseTicks--;
      continue;
    }
    // Random direction change
    if (Math.random() < 0.15) A.angle += rand(-Math.PI/2, Math.PI/2);
    A.x += Math.cos(A.angle) * ANT_SPEED;
    A.y += Math.sin(A.angle) * ANT_SPEED;
    if (A.x < ANT_RADIUS) { A.x = ANT_RADIUS; A.angle = Math.PI - A.angle; }
    else if (A.x > WORLD_WIDTH - ANT_RADIUS) { A.x = WORLD_WIDTH - ANT_RADIUS; A.angle = Math.PI - A.angle; }
    if (A.y < ANT_RADIUS) { A.y = ANT_RADIUS; A.angle = -A.angle; }
    else if (A.y > WORLD_HEIGHT - ANT_RADIUS) { A.y = WORLD_HEIGHT - ANT_RADIUS; A.angle = -A.angle; }
    A.moveTicks--;
    if (A.moveTicks <= 0) {
      A.moveTicks = ANT_MOVE_TICKS;
      A.pauseTicks = ANT_PAUSE_TICKS;
      A.angle += rand(-Math.PI * 0.75, Math.PI * 0.75); // new direction after pause
    }
  }

  // ── Move players ──────────────────────────────────────────────
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;

    // Ant drag check, applied to head
    if (!p.isNpc && p.dragTicks === undefined) p.dragTicks = 0;
    if (!p.isNpc) {
      if (p.dragTicks > 0) {
        p.dragTicks--;
        // Force snake heading toward ant's last angle
        const diff2 = p.dragAngle - p.angle;
        const d2 = ((diff2 + Math.PI) % (2 * Math.PI)) - Math.PI;
        p.targetAngle = p.dragAngle;
      }
    }

    let diff = p.targetAngle - p.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.10);

    const head = p.segments[0];

    if (p.slow > 0) p.slow--;
    for (const pid in puddles) {
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, puddles[pid].x, puddles[pid].y, PUDDLE_RADIUS)) {
        p.slow = PUDDLE_SLOW_TIME;
        break;
      }
    }

    let speed = (p.boosting && p.length > 10) ? BOOST_SPEED : SNAKE_SPEED;
    if (p.slow > 0) speed *= 0.5;

    let nx = head.x + Math.cos(p.angle) * speed;
    let ny = head.y + Math.sin(p.angle) * speed;

    // Check if snake touches the borders - if so, it dies
    if (nx < HEAD_RADIUS || nx > WORLD_WIDTH - HEAD_RADIUS ||
      ny < HEAD_RADIUS || ny > WORLD_HEIGHT - HEAD_RADIUS) {
      if (p.isNpc) {
        p.targetAngle += Math.PI;
        p.angle += Math.PI;
        nx = head.x + Math.cos(p.angle) * speed * 2;
        ny = head.y + Math.sin(p.angle) * speed * 2;
      } else {
        p.alive = false;
        deaths.push({ id: p.id, killedBy: null });
        // Drop food from dead snake
        for (let k = 0; k < p.segments.length; k += 3) {
          const fid = foodId++;
          foods[fid] = { id: fid, x: p.segments[k].x, y: p.segments[k].y, color: p.color, value: 1, life: rand(300, 900) };
          deltaFood.push({ type: 'add', food: foods[fid] });
        }
        continue;
      }
    }

    p.segments.unshift({ x: nx, y: ny });
    while (p.segments.length > p.length) p.segments.pop();

    if (p.protection > 0) p.protection--;
    if (p.lethal > 0) p.lethal--;
    if (p.portalCooldown > 0) p.portalCooldown--;

    // Portal enter logic
    if (p.portalCooldown <= 0) {
      const h = p.segments[0];
      for (const pid2 in portals) {
        const port = portals[pid2];
        if (circlesOverlap(h.x, h.y, HEAD_RADIUS, port.x, port.y, PORTAL_RADIUS)) {
          const others = Object.values(portals).filter(op => op.id !== port.id);
          if (others.length > 0) {
            const dest = others[Math.floor(Math.random() * others.length)];
            h.x = dest.x;
            h.y = dest.y;
            p.portalCooldown = 45;
            p.entrancePortal = port.id;
            p.exitPortal = dest.id;
            break;
          }
        }
      }
    }

    // Traverse check
    let isTraversing = false;
    for (let i = 0; i < p.segments.length - 1; i++) {
      const dx = p.segments[i].x - p.segments[i + 1].x;
      const dy = p.segments[i].y - p.segments[i + 1].y;
      if (dx * dx + dy * dy > 40000) {
        isTraversing = true;
        break;
      }
    }

    if (isTraversing) {
      if (!portals[p.entrancePortal] || !portals[p.exitPortal]) {
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

    if (p.boosting && p.length > 10) {
      p.length -= 0.3;
      p.score = Math.max(0, p.score - 0.3);
      if (Math.random() < 0.3) {
        const fid = foodId++;
        foods[fid] = { id: fid, x: p.segments[p.segments.length - 1].x, y: p.segments[p.segments.length - 1].y, color: p.color, value: 1, life: rand(300, 900) };
        deltaFood.push({ type: 'add', food: foods[fid] });
      }
    }

    deltaPlayers[pid] = {
      id: p.id, name: p.name, color: p.color, pattern: p.pattern,
      score: Math.floor(p.score), alive: p.alive, boosting: (p.boosting && p.length > 10),
      ammo: p.ammo, maxAmmo: p.maxAmmo,
      mines: MAX_MINES - p.mineCount, maxMines: MAX_MINES,
      protected: (p.protection > 0),
      lethal: (p.lethal > 0),
      isNpc: p.isNpc,
      slow: (p.slow > 0),
      segments: p.segments
    };
  }

  // ── Food eating ───────────────────────────────────────────────
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;
    const head = p.segments[0];
    for (const fid in foods) {
      const f = foods[fid];
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, f.x, f.y, FOOD_RADIUS)) {
        p.score += f.value;
        p.length += f.value * 2;
        // Recharge ammo on eat
        if (p.ammo < p.maxAmmo) p.ammo = Math.min(p.maxAmmo, p.ammo + AMMO_PER_FOOD);
        delete foods[fid];
        deltaFood.push({ type: 'remove', id: fid });
      }
    }
    
    // Eat larvae
    for (const lid in larvas) {
      const L = larvas[lid];
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, L.x, L.y, LARVA_RADIUS)) {
        p.score += LARVA_VALUE;
        p.length += LARVA_VALUE * 2;
        delete larvas[lid];
      }
    }
    
    // Slug damage (any body segment touching slug)
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
              p.length = Math.max(4, p.length - dmg);
              p.score = Math.max(0, p.score - dmg * 0.5);
              for (let k = 0; k < dmg * 2; k++) {
                const idx = p.segments.length - 1 - k;
                if (idx < 0) break;
                const fid = foodId++;
                foods[fid] = { id: fid, x: p.segments[idx].x, y: p.segments[idx].y, color: p.color, value: 1, life: rand(300, 600) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
            }
            S._hitCooldown[p.id] = SLUG_HIT_COOLDOWN;
            break;
          }
        }
      }
    }

    // Eat earthworms (head touches any worm segment)
    for (const wid in worms) {
      const W = worms[wid];
      for (let s = 0; s < W.segs.length; s++) {
        if (circlesOverlap(head.x, head.y, HEAD_RADIUS, W.segs[s].x, W.segs[s].y, WORM_RADIUS)) {
          p.score += WORM_VALUE;
          p.length += WORM_VALUE * 2;
          delete worms[wid];
          break;
        }
      }
    }

    // Ant collision: drag + damage
    if (!p.isNpc) {
      for (const aid in ants) {
        const A = ants[aid];
        A._hitCooldown = A._hitCooldown || {};
        const cooldown = A._hitCooldown[p.id] || 0;
        if (cooldown > 0) { A._hitCooldown[p.id]--; continue; }
        if (circlesOverlap(head.x, head.y, HEAD_RADIUS, A.x, A.y, ANT_RADIUS)) {
          // Damage
          const dmg = Math.min(ANT_DAMAGE, p.length - 4);
          if (dmg > 0) {
            p.length = Math.max(4, p.length - dmg);
            p.score = Math.max(0, p.score - dmg * 0.5);
            for (let k = 0; k < dmg * 2; k++) {
              const idx = p.segments.length - 1 - k;
              if (idx < 0) break;
              const fid = foodId++;
              foods[fid] = { id: fid, x: p.segments[idx].x, y: p.segments[idx].y, color: p.color, value: 1, life: rand(300, 600) };
              deltaFood.push({ type: 'add', food: foods[fid] });
            }
          }
          // Drag
          p.dragAngle = A.angle;
          p.dragTicks = ANT_DRAG_TICKS;
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
      const a = apples[aid];
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, a.x, a.y, APPLE_RADIUS)) {
        p.protection = PROTECTION_TIME;
        delete apples[aid];
        spawnApple();
      }
    }
    for (const gid in greenApples) {
      const g = greenApples[gid];
      if (circlesOverlap(head.x, head.y, HEAD_RADIUS, g.x, g.y, APPLE_RADIUS)) {
        p.lethal = LETHAL_TIME;
        delete greenApples[gid];
        spawnGreenApple();
      }
    }
  }

  // ── Move & age fireballs ──────────────────────────────────────
  const fbDelta = [];   // changes to broadcast

  for (const fbid in fireballs) {
    const fb = fireballs[fbid];
    fb.x += Math.cos(fb.angle) * FIREBALL_SPEED;
    fb.y += Math.sin(fb.angle) * FIREBALL_SPEED;
    fb.life -= 1;

    // Out of bounds or expired
    if (fb.life <= 0 || fb.x < 0 || fb.x > WORLD_WIDTH || fb.y < 0 || fb.y > WORLD_HEIGHT) {
      delete fireballs[fbid];
      fbDelta.push({ type: 'remove', id: fbid });
      continue;
    }

    // Check hit vs all other players
    let hit = false;
    for (const pid in players) {
      if (pid === fb.ownerId) continue;
      const target = players[pid];
      if (!target.alive || !target.segments?.length) continue;

      // Check vs every segment
      for (let s = 0; s < target.segments.length; s++) {
        const seg = target.segments[s];
        if (circlesOverlap(fb.x, fb.y, FIREBALL_RADIUS, seg.x, seg.y, SNAKE_RADIUS + 2)) {
          if (target.protection > 0) {
            shieldHits.push({ x: fb.x, y: fb.y });
          } else {
            // Hit! shrink target
            const dmg = Math.min(FIREBALL_DAMAGE, target.length - 4);
            if (dmg > 0) {
              target.length = Math.max(4, target.length - dmg);
              target.score = Math.max(0, target.score - dmg * 0.5);
              // Drop food from removed tail
              for (let k = 0; k < dmg * 2; k++) {
                const idx = target.segments.length - 1 - k;
                if (idx < 0) break;
                const fid = foodId++;
                foods[fid] = { id: fid, x: target.segments[idx].x, y: target.segments[idx].y, color: target.color, value: 1, life: rand(300, 900) };
                deltaFood.push({ type: 'add', food: foods[fid] });
              }
              // Give shooter some score
              const shooter = players[fb.ownerId];
              if (shooter) { shooter.score += dmg * 0.5; }
            }
            fbHits.push({ fbId: fbid, targetId: pid, x: fb.x, y: fb.y });
          }
          delete fireballs[fbid];
          fbDelta.push({ type: 'remove', id: fbid });
          hit = true;
          break;
        }
      }
      if (hit) break;
    }

    if (!hit && fireballs[fbid]) {
      fbDelta.push({ type: 'update', fb: { id: fb.id, x: fb.x, y: fb.y, life: fb.life, angle: fb.angle, ownerId: fb.ownerId, color: fb.color } });
    }
  }

  // ── Snake-snake head collisions ───────────────────────────────
  const pids = Object.keys(players).filter(pid => players[pid].alive);
  for (let i = 0; i < pids.length; i++) {
    for (let j = 0; j < pids.length; j++) {
      if (i === j) continue;
      const pa = players[pids[i]], pb = players[pids[j]];
      if (!pa.alive || !pb.alive) continue;
      if (pa.isNpc && pb.isNpc) continue;
      const headA = pa.segments[0];
      const startSeg = pb.isNpc ? 0 : 2;
      for (let s = startSeg; s < pb.segments.length; s++) {
        const seg = pb.segments[s];
        const hitRad = SNAKE_RADIUS + (pb.isNpc ? 4 : 0);
        if (circlesOverlap(headA.x, headA.y, HEAD_RADIUS - 2, seg.x, seg.y, hitRad)) {
          if (pa.isNpc) {
            pb.alive = false;
            deaths.push({ id: pb.id, killedBy: pa.id });
            for (let k = 0; k < pb.segments.length; k += 3) {
              const fid = foodId++;
              foods[fid] = { id: fid, x: pb.segments[k].x, y: pb.segments[k].y, color: pb.color, value: 1, life: rand(300, 900) };
              deltaFood.push({ type: 'add', food: foods[fid] });
            }
            break;
          } else if (pb.isNpc) {
            pa.alive = false;
            deaths.push({ id: pa.id, killedBy: pb.id });
            for (let k = 0; k < pa.segments.length; k += 3) {
              const fid = foodId++;
              foods[fid] = { id: fid, x: pa.segments[k].x, y: pa.segments[k].y, color: pa.color, value: 1, life: rand(300, 900) };
              deltaFood.push({ type: 'add', food: foods[fid] });
            }
            break;
          } else if (pa.lethal > 0) {
            pb.alive = false;
            deaths.push({ id: pb.id, killedBy: pa.id });
            for (let k = 0; k < pb.segments.length; k += 3) {
              const fid = foodId++;
              foods[fid] = { id: fid, x: pb.segments[k].x, y: pb.segments[k].y, color: pb.color, value: 1, life: rand(300, 900) };
              deltaFood.push({ type: 'add', food: foods[fid] });
            }
            break;
          } else {
            pa.alive = false;
            deaths.push({ id: pa.id, killedBy: pb.id });
            for (let k = 0; k < pa.segments.length; k += 3) {
              const fid = foodId++;
              foods[fid] = { id: fid, x: pa.segments[k].x, y: pa.segments[k].y, color: pa.color, value: 1, life: rand(300, 900) };
              deltaFood.push({ type: 'add', food: foods[fid] });
            }
            break;
          }
        }
      }
    }
  }

  // ── Mine collisions ───────────────────────────────────────────
  const mineDelta = [];   // changes to broadcast
  const mineHits = [];   // { mineId, targetId }

  for (const mid in mines) {
    const m = mines[mid];
    m.life -= 1;

    // Expired
    if (m.life <= 0) {
      delete mines[mid];
      const owner = players[m.ownerId];
      if (owner) owner.mineCount--;
      mineDelta.push({ type: 'remove', id: mid });
      continue;
    }

    // Check hit vs all players
    let hit = false;
    for (const pid in players) {
      if (pid === m.ownerId) continue; // owner's mines don't hurt owner
      const target = players[pid];
      if (!target.alive || !target.segments?.length) continue;

      // Check vs every segment
      for (let s = 0; s < target.segments.length; s++) {
        const seg = target.segments[s];
        if (circlesOverlap(m.x, m.y, MINE_RADIUS, seg.x, seg.y, SNAKE_RADIUS + 2)) {
          if (target.protection > 0) {
            shieldHits.push({ x: m.x, y: m.y });
          } else {
            // Hit! shrink target
            const dmg = Math.min(MINE_DAMAGE, target.length - 4);
            if (dmg > 0) {
              target.length = Math.max(4, target.length - dmg);
              target.score = Math.max(0, target.score - dmg * 0.5);
              // Drop food from removed tail
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
          const owner = players[m.ownerId];
          if (owner) owner.mineCount--;
          mineDelta.push({ type: 'remove', id: mid });
          hit = true;
          break;
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

  io.emit('tick', { players: deltaPlayers, foodChanges: deltaFood, leaderboard, fbDelta, fbHits, mineDelta, mineHits, apples: Object.values(apples), shieldHits, greenApples: Object.values(greenApples), portals: Object.values(portals), puddles: Object.values(puddles), larvas: Object.values(larvas), slugs: Object.values(slugs), worms: Object.values(worms), ants: Object.values(ants) });

  for (const d of deaths) io.to(d.id).emit('died', { killedBy: d.killedBy });
}

// ── Socket.IO ────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('join', ({ name, color, pattern }) => {
    players[socket.id] = createPlayer(socket.id, name, color, pattern);
    socket.emit('init', {
      id: socket.id,
      foods: Object.values(foods),
      players: Object.values(players),
      fireballs: Object.values(fireballs),
      mines: Object.values(mines),
      apples: Object.values(apples),
      greenApples: Object.values(greenApples),
      portals: Object.values(portals),
      puddles: Object.values(puddles),
      larvas: Object.values(larvas),
      slugs: Object.values(slugs),
      worms: Object.values(worms),
      ants: Object.values(ants),
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT
    });
    io.emit('playerJoined', { id: socket.id, name: players[socket.id].name });
  });

  socket.on('input', ({ angle, boosting }) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (typeof angle === 'number') p.targetAngle = angle;
    if (typeof boosting === 'boolean') p.boosting = boosting;
  });

  socket.on('fireball', () => {
    const p = players[socket.id];
    if (!p || !p.alive || p.ammo <= 0) return;
    p.ammo--;
    const head = p.segments[0];
    const fbid = fireballId++;
    fireballs[fbid] = {
      id: fbid,
      ownerId: socket.id,
      color: p.color,
      x: head.x + Math.cos(p.angle) * (HEAD_RADIUS + FIREBALL_RADIUS + 2),
      y: head.y + Math.sin(p.angle) * (HEAD_RADIUS + FIREBALL_RADIUS + 2),
      angle: p.angle,
      life: FIREBALL_LIFETIME
    };
    // Broadcast new fireball to all
    io.emit('fireballSpawned', fireballs[fbid]);
  });

  socket.on('mine', () => {
    const p = players[socket.id];
    if (!p || !p.alive || p.mineCount >= MAX_MINES) return;
    const mine = placeMine(socket.id);
    if (mine) {
      // Broadcast new mine to all
      io.emit('mineSpawned', mine);
    }
  });

  socket.on('respawn', ({ color, pattern } = {}) => {
    const p = players[socket.id];
    if (!p) return;
    players[socket.id] = createPlayer(socket.id, p.name, color || p.color, pattern || p.pattern);
    socket.emit('respawned', { player: players[socket.id] });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
    console.log('disconnect', socket.id);
  });
});

// ── Boot ─────────────────────────────────────────────────────────
  initFood();
  initAnts();
  setInterval(gameTick, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐍 Slither server → http://localhost:${PORT}`));
