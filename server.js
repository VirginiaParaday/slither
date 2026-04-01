const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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
let foodId = 0;
let fireballId = 0;
let mineId = 0;
let appleId = 0;
let greenAppleId = 0;

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
function initFood() {
  for (let i = 0; i < FOOD_COUNT; i++) spawnFood(foodId++);
  for (let i = 0; i < APPLE_COUNT; i++) spawnApple();
  for (let i = 0; i < GREEN_APPLE_COUNT; i++) spawnGreenApple();
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
    lethal: 0                 // lethal ticks remaining
  };
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

  // ── Move players ──────────────────────────────────────────────
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;

    let diff = p.targetAngle - p.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.10);

    const speed = (p.boosting && p.length > 10) ? BOOST_SPEED : SNAKE_SPEED;
    const head = p.segments[0];
    let nx = head.x + Math.cos(p.angle) * speed;
    let ny = head.y + Math.sin(p.angle) * speed;

    // Check if snake touches the borders - if so, it dies
    if (nx < HEAD_RADIUS || nx > WORLD_WIDTH - HEAD_RADIUS ||
      ny < HEAD_RADIUS || ny > WORLD_HEIGHT - HEAD_RADIUS) {
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

    p.segments.unshift({ x: nx, y: ny });
    while (p.segments.length > p.length) p.segments.pop();

    if (p.protection > 0) p.protection--;
    if (p.lethal > 0) p.lethal--;

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
      const headA = pa.segments[0];
      for (let s = 2; s < pb.segments.length; s++) {
        const seg = pb.segments[s];
        if (circlesOverlap(headA.x, headA.y, HEAD_RADIUS - 2, seg.x, seg.y, SNAKE_RADIUS)) {
          if (pa.lethal > 0) {
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

  io.emit('tick', { players: deltaPlayers, foodChanges: deltaFood, leaderboard, fbDelta, fbHits, mineDelta, mineHits, apples: Object.values(apples), shieldHits, greenApples: Object.values(greenApples) });

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
setInterval(gameTick, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐍 Slither server → http://localhost:${PORT}`));
