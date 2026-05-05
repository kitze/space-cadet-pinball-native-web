// @ts-nocheck
import { clamp, closestPointOnSegment, normalize, rotatePoint } from "./math";
import { CollisionMask } from "./collisionMask";

function clonePoint(point) {
  return { x: point.x, y: point.y, z: point.z ?? 0 };
}

function flipperEnd(flipper) {
  return rotatePoint(flipper.source, flipper.origin, flipper.angle);
}

function reflectVelocity(ball, normal, elasticity, boost = 0) {
  const vn = ball.vx * normal.x + ball.vy * normal.y;
  const impact = Math.abs(vn);
  if (vn < -0.001) {
    const impulse = -(1 + elasticity) * vn;
    ball.vx += normal.x * impulse;
    ball.vy += normal.y * impulse;
  }
  if (boost && impact > 70) {
    const boostAmount = Math.min(boost, 220) * Math.min(1, impact / 520);
    ball.vx += normal.x * boostAmount;
    ball.vy += normal.y * boostAmount;
  }
  ball.vx *= 0.992;
  ball.vy *= 0.992;
  return impact;
}

function edgeKey(edge) {
  if (edge.key) {
    return edge.key;
  }
  if (edge.type === "circle") {
    return `c:${edge.center.x}:${edge.center.y}:${edge.radius}`;
  }
  return `l:${edge.a.x}:${edge.a.y}:${edge.b.x}:${edge.b.y}`;
}

export class PinballGame {
  constructor(model) {
    this.setModel(model);
  }

  setModel(model) {
    this.model = model;
    this.score = 0;
    this.ballNumber = 1;
    this.input = {
      left: false,
      right: false,
      plunger: false,
    };
    this.launchPower = 0;
    this.mode = "Ready";
    this.effects = [];
    this.hitCooldowns = new Map();
    this.collisionMask = model.assetArt?.collisionGuide ? new CollisionMask(model.assetArt.collisionGuide) : null;
    this.resetBall(false);
  }

  resetBall(countDrain = true) {
    const bounds = this.model.playBounds;
    const start = this.model.plungerPosition ?? { x: bounds.maxX - 1.2, y: bounds.maxY - 3.5 };
    this.ball = {
      x: start.x,
      y: start.y,
      z: this.model.ballRadius,
      vx: 0,
      vy: 0,
      radius: this.model.ballRadius,
      trail: [],
    };
    this.launchPower = 0;
    this.mode = "Ready";
    if (countDrain) {
      this.ballNumber = this.ballNumber >= 3 ? 1 : this.ballNumber + 1;
    }
  }

  newGame() {
    this.score = 0;
    this.ballNumber = 1;
    this.resetBall(false);
  }

  setInput(action, pressed) {
    if (action in this.input) {
      if (this.input[action] === pressed) {
        return;
      }
      this.input[action] = pressed;
      if (action === "plunger" && !pressed) {
        this.launch();
      }
    }
  }

  launch() {
    const bounds = this.model.playBounds;
    const laneX = this.model.plungerPosition?.x ?? bounds.maxX - 1.2;
    const inLane = Math.abs(this.ball.x - laneX) < this.ball.radius * 3.5 && this.ball.y > bounds.maxY - 260;
    if (!inLane && Math.hypot(this.ball.vx, this.ball.vy) > 1) {
      return;
    }
    const power = 16 + this.launchPower * 24;
    const launch = this.model.launch;
    if (launch) {
      if (launch.spawn) {
        this.ball.x = launch.spawn.x;
        this.ball.y = launch.spawn.y;
      } else {
        this.ball.x = this.model.plungerPosition.x - this.ball.radius * 0.55;
        this.ball.y = this.model.plungerPosition.y - this.ball.radius * 1.6;
      }
      this.ball.vx = launch.x + this.launchPower * (launch.powerX ?? 0);
      this.ball.vy = launch.y + this.launchPower * (launch.powerY ?? 0);
      this.ball.noCollideTimer = launch.noCollideTimer ?? 0;
    } else {
      this.ball.vx = -0.65 - this.launchPower * 0.7;
      this.ball.vy = -power;
    }
    this.launchPower = 0;
    this.mode = "Live";
    this.addEffect({
      type: "launch",
      x: this.ball.x,
      y: this.ball.y,
      radius: this.ball.radius * 2.8,
      life: 0.42,
      maxLife: 0.42,
      color: "#f2c14e",
    });
  }

  step(dt) {
    const cappedDt = Math.min(dt, 1 / 24);
    this.updateFlippers(cappedDt);
    if (this.input.plunger) {
      this.launchPower = clamp(this.launchPower + cappedDt * 0.72, 0, 1);
      this.mode = "Charge";
    }

    if (this.mode !== "Live") {
      this.ball.trail.length = 0;
      this.updateEffects(cappedDt);
      this.updateHitCooldowns(cappedDt);
      return;
    }

    const substeps = Math.max(2, Math.ceil(cappedDt / (1 / 180)));
    const h = cappedDt / substeps;
    for (let i = 0; i < substeps; i += 1) {
      this.integrate(h);
      this.ball.noCollideTimer = Math.max(0, (this.ball.noCollideTimer ?? 0) - h);
      if (!this.ball.noCollideTimer) {
        if (this.collisionMask?.ready) {
          this.solveCollisionMask();
        } else {
          this.solveStaticEdges();
        }
        this.solveFlippers();
      }
      this.solveBounds();
    }

    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    const maxSpeed = this.model.maxBallSpeed ?? 1800;
    if (speed > maxSpeed) {
      this.ball.vx = (this.ball.vx / speed) * maxSpeed;
      this.ball.vy = (this.ball.vy / speed) * maxSpeed;
    }

    this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
    if (this.ball.trail.length > 12) {
      this.ball.trail.shift();
    }
    this.updateEffects(cappedDt);
    this.updateHitCooldowns(cappedDt);
  }

  addEffect(effect) {
    this.effects.push(effect);
    if (this.effects.length > 24) {
      this.effects.shift();
    }
  }

  updateEffects(dt) {
    for (const effect of this.effects) {
      effect.life -= dt;
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  updateHitCooldowns(dt) {
    for (const [key, value] of this.hitCooldowns.entries()) {
      const next = value - dt;
      if (next <= 0) {
        this.hitCooldowns.delete(key);
      } else {
        this.hitCooldowns.set(key, next);
      }
    }
  }

  registerHit(key, cooldown = 0.18) {
    if (this.hitCooldowns.has(key)) {
      return false;
    }
    this.hitCooldowns.set(key, cooldown);
    return true;
  }

  integrate(dt) {
    this.ball.vx += this.model.gravity.x * dt;
    this.ball.vy += this.model.gravity.y * dt;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
  }

  updateFlippers(dt) {
    for (const flipper of this.model.flippers) {
      const pressed = flipper.side === "left" ? this.input.left : this.input.right;
      const target = pressed ? flipper.angleMax : 0;
      const previous = flipper.angle;
      const delta = target - flipper.angle;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), flipper.speed * dt);
      flipper.angle += Number.isFinite(step) ? step : 0;
      flipper.angularVelocity = dt > 0 ? (flipper.angle - previous) / dt : 0;
    }
  }

  solveStaticEdges() {
    for (const edge of this.model.edges) {
      if (edge.type === "circle") {
        this.solveCircle(edge);
      } else {
        this.solveLine(edge);
      }
    }
  }

  solveCollisionMask() {
    const hit = this.collisionMask.collide(this.ball);
    if (!hit) {
      return;
    }

    this.ball.x += hit.normal.x * Math.min(10, hit.hits * 0.55);
    this.ball.y += hit.normal.y * Math.min(10, hit.hits * 0.55);
    const impact = reflectVelocity(this.ball, hit.normal, hit.kind === "post" ? 0.88 : 0.76, hit.kind === "post" ? 85 : 0);
    if (impact > 22 && this.registerHit(`mask:${Math.round(hit.x / 24)}:${Math.round(hit.y / 24)}`, hit.kind === "post" ? 0.2 : 0.08)) {
      this.score += hit.kind === "post" ? 25 : 3;
      this.addEffect({
        type: "mask",
        x: hit.x,
        y: hit.y,
        radius: this.ball.radius * (hit.kind === "post" ? 2.5 : 1.5),
        life: 0.18,
        maxLife: 0.18,
        color: hit.kind === "post" ? "#7cf7ff" : "#51c878",
      });
    }
  }

  solveCircle(edge) {
    const dx = this.ball.x - edge.center.x;
    const dy = this.ball.y - edge.center.y;
    const minDistance = this.ball.radius + edge.radius;
    const normal = normalize(dx, dy);
    if (normal.mag <= 1e-7 || normal.mag >= minDistance) {
      return;
    }

    const overlap = minDistance - normal.mag;
    this.ball.x += normal.x * overlap;
    this.ball.y += normal.y * overlap;
    const impact = reflectVelocity(this.ball, normal, edge.elasticity, edge.boost);
    const key = edgeKey(edge);
    if (impact > 18 && this.registerHit(key, edge.boost ? 0.55 : 0.16)) {
      this.score += edge.score;
      this.addEffect({
        type: "hit",
        x: edge.center.x,
        y: edge.center.y,
        radius: Math.max(edge.radius * 1.8, this.ball.radius * 3),
        life: 0.32,
        maxLife: 0.32,
        color: edge.boost ? "#7cf7ff" : "#f2c14e",
      });
    }
  }

  solveLine(edge) {
    const closest = closestPointOnSegment(this.ball, edge.a, edge.b);
    let dx = this.ball.x - closest.x;
    let dy = this.ball.y - closest.y;
    let normal = normalize(dx, dy);
    const minDistance = this.ball.radius + edge.radius;
    if (normal.mag <= 1e-7) {
      const ex = edge.b.x - edge.a.x;
      const ey = edge.b.y - edge.a.y;
      normal = normalize(ey, -ex);
      dx = normal.x * minDistance;
      dy = normal.y * minDistance;
    }
    if (normal.mag >= minDistance) {
      return;
    }

    const overlap = minDistance - Math.hypot(dx, dy);
    this.ball.x += normal.x * overlap;
    this.ball.y += normal.y * overlap;
    const impact = reflectVelocity(this.ball, normal, edge.elasticity, edge.boost);
    const key = edgeKey(edge);
    if (impact > 22 && this.registerHit(key, 0.12)) {
      this.score += edge.score;
      this.addEffect({
        type: "spark",
        x: closest.x,
        y: closest.y,
        radius: this.ball.radius * 2.1,
        life: 0.22,
        maxLife: 0.22,
        color: edge.boost ? "#ff4d8d" : "#f2c14e",
      });
    }
  }

  solveFlippers() {
    for (const flipper of this.model.flippers) {
      const start = flipper.origin;
      const end = flipperEnd(flipper);
      const closest = closestPointOnSegment(this.ball, start, end);
      const dx = this.ball.x - closest.x;
      const dy = this.ball.y - closest.y;
      let normal = normalize(dx, dy);
      const minDistance = this.ball.radius + flipper.collisionRadius;
      if (normal.mag <= 1e-7 || normal.mag >= minDistance) {
        continue;
      }

      const overlap = minDistance - normal.mag;
      this.ball.x += normal.x * overlap;
      this.ball.y += normal.y * overlap;

      const rx = closest.x - flipper.origin.x;
      const ry = closest.y - flipper.origin.y;
      const tangent = normalize(-ry * Math.sign(flipper.angularVelocity || 1), rx * Math.sign(flipper.angularVelocity || 1));
      const speedBoost = Math.min(12, Math.abs(flipper.angularVelocity) * 1.2 * (0.3 + closest.t));
      const impact = reflectVelocity(this.ball, normal, 0.84, speedBoost * 0.55);
      this.ball.vx += tangent.x * speedBoost * 0.22;
      this.ball.vy += tangent.y * speedBoost * 0.22;
      if (impact > 16 && this.registerHit(`f:${flipper.name}`, 0.1)) {
        this.score += 25;
        this.addEffect({
          type: "flipper",
          x: closest.x,
          y: closest.y,
          radius: this.ball.radius * 3.2,
          life: 0.26,
          maxLife: 0.26,
          color: "#ffffff",
        });
      }
    }
  }

  solveBounds() {
    const bounds = this.model.playBounds;
    const ball = this.ball;
    if (ball.x < bounds.minX + ball.radius) {
      ball.x = bounds.minX + ball.radius;
      ball.vx = Math.abs(ball.vx) * 0.72;
      this.addEffect({ type: "rail", x: ball.x, y: ball.y, radius: ball.radius * 1.9, life: 0.18, maxLife: 0.18, color: "#7cf7ff" });
    } else if (ball.x > bounds.maxX - ball.radius) {
      ball.x = bounds.maxX - ball.radius;
      ball.vx = -Math.abs(ball.vx) * 0.72;
      this.addEffect({ type: "rail", x: ball.x, y: ball.y, radius: ball.radius * 1.9, life: 0.18, maxLife: 0.18, color: "#7cf7ff" });
    }

    if (ball.y < bounds.minY + ball.radius) {
      ball.y = bounds.minY + ball.radius;
      ball.vy = Math.abs(ball.vy) * 0.72;
      this.addEffect({ type: "rail", x: ball.x, y: ball.y, radius: ball.radius * 1.9, life: 0.18, maxLife: 0.18, color: "#7cf7ff" });
    }

    if (ball.y > bounds.maxY + (this.model.drainSlack ?? 1.4)) {
      this.resetBall(true);
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 4 && this.mode === "Live") {
      ball.vx *= 0.97;
      ball.vy *= 0.97;
    }
  }

  snapshot() {
    return {
      score: this.score,
      ball: this.ballNumber,
      mode: this.mode,
      launchPower: this.launchPower,
      effects: this.effects.map((effect) => ({ ...effect })),
      flippers: this.model.flippers.map((flipper) => ({
        ...flipper,
        origin: clonePoint(flipper.origin),
        end: flipperEnd(flipper),
      })),
    };
  }
}
