// @ts-nocheck
function rgbaToCanvas(layer) {
  const canvas = document.createElement("canvas");
  canvas.width = layer.rgba.width;
  canvas.height = layer.rgba.height;
  const ctx = canvas.getContext("2d", { alpha: true });
  const imageData = new ImageData(layer.rgba.rgba, layer.rgba.width, layer.rgba.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function loadSprite(src) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image;
}

function formatScore(score) {
  return Math.floor(score).toLocaleString("en-US");
}

export class GameRenderer {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.hud = hud;
    this.debug = false;
    this.logicalWidth = 600;
    this.logicalHeight = 416;
    this.layers = [];
    this.assetImages = {};
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  setModel(model) {
    this.model = model;
    this.logicalWidth = model.pixelSize.width;
    this.logicalHeight = model.pixelSize.height;
    const aspect = this.logicalWidth / this.logicalHeight;
    this.canvas.style.aspectRatio = `${this.logicalWidth} / ${this.logicalHeight}`;
    this.canvas.parentElement?.style.setProperty("--frame-aspect", String(aspect));
    this.layers = model.images.map((layer) => ({
      ...layer,
      canvas: rgbaToCanvas(layer),
    }));
    this.assetImages = {};
    if (model.assetArt) {
      this.assetImages.background = loadSprite(model.assetArt.background);
      if (model.assetArt.foreground) {
        this.assetImages.foreground = loadSprite(model.assetArt.foreground);
      }
      if (model.assetArt.collisionGuide) {
        this.assetImages.collisionGuide = loadSprite(model.assetArt.collisionGuide);
      }
      for (const [key, src] of Object.entries(model.assetArt.sprites ?? {})) {
        this.assetImages[key] = loadSprite(src);
      }
    }
    this.resize();
  }

  setDebug(enabled) {
    this.debug = enabled;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(this.logicalWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.logicalHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  worldToScreen(point) {
    if (this.model.project) {
      return this.model.project(point);
    }

    const bounds = this.model.bounds;
    return {
      x: ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * this.logicalWidth,
      y: ((point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * this.logicalHeight,
    };
  }

  screenRadius(point, radius) {
    const p = this.worldToScreen(point);
    const q = this.worldToScreen({ x: point.x + radius, y: point.y, z: point.z ?? 0 });
    return Math.max(3, Math.hypot(q.x - p.x, q.y - p.y));
  }

  render(game) {
    const snapshot = game.snapshot();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

    if (this.model.assetArt) {
      this.drawAssetTable(ctx);
    } else if (this.layers.length) {
      this.drawDatLayers(ctx);
    } else {
      this.drawFallbackTable(ctx);
    }

    this.drawDecals(ctx);

    if (this.debug) {
      this.drawCollisionGuide(ctx);
      this.drawDebugEdges(ctx);
    }

    this.drawEffects(ctx, snapshot.effects, "under");
    this.drawBallTrail(ctx, game.ball);
    this.drawBall(ctx, game.ball);
    this.drawForegroundOccluders(ctx);
    this.drawEffects(ctx, snapshot.effects, "over");
    this.drawFlippers(ctx, snapshot.flippers);
    this.drawLaunchMeter(ctx, snapshot.launchPower);
    this.updateHud(snapshot);
  }

  drawDatLayers(ctx) {
    ctx.fillStyle = "#020304";
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    for (const layer of this.layers) {
      ctx.drawImage(layer.canvas, layer.x, layer.y);
    }
  }

  drawAssetTable(ctx) {
    ctx.fillStyle = "#020304";
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    const background = this.assetImages.background;
    if (background?.complete && background.naturalWidth) {
      ctx.drawImage(background, 0, 0, this.logicalWidth, this.logicalHeight);
    }
  }

  drawDecals(ctx) {
    const decals = this.model.assetArt?.decals ?? [];
    if (!decals.length) {
      return;
    }
    ctx.save();
    for (const decal of decals) {
      const image = this.assetImages[decal.sprite];
      if (!image?.complete || !image.naturalWidth) {
        continue;
      }
      const width = decal.width;
      const height = width * (image.naturalHeight / image.naturalWidth);
      ctx.save();
      ctx.translate(decal.x, decal.y);
      ctx.rotate(decal.rotation ?? 0);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
    ctx.restore();
  }

  drawForegroundOccluders(ctx) {
    const foreground = this.assetImages.foreground;
    if (foreground?.complete && foreground.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = this.model.assetArt?.foregroundOpacity ?? 1;
      ctx.drawImage(foreground, 0, 0, this.logicalWidth, this.logicalHeight);
      ctx.restore();
    }
  }

  drawCollisionGuide(ctx) {
    const guide = this.assetImages.collisionGuide;
    if (!guide?.complete || !guide.naturalWidth) {
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.56;
    ctx.drawImage(guide, 0, 0, this.logicalWidth, this.logicalHeight);
    ctx.restore();
  }

  drawEffects(ctx, effects = [], pass = "over") {
    if (!effects.length) {
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = pass === "under" ? "screen" : "lighter";
    for (const effect of effects) {
      const age = 1 - effect.life / effect.maxLife;
      const alpha = Math.max(0, 1 - age);
      const screen = this.worldToScreen({ x: effect.x, y: effect.y, z: 0 });
      const radius = effect.radius * (0.62 + age * 1.1);
      const color = effect.color ?? "#f2c14e";
      const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius);
      gradient.addColorStop(0, `${color}${pass === "under" ? "aa" : "dd"}`);
      gradient.addColorStop(0.35, `${color}66`);
      gradient.addColorStop(1, `${color}00`);
      ctx.globalAlpha = alpha * (pass === "under" ? 0.55 : 0.95);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (pass === "over") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `${color}cc`;
        ctx.lineWidth = Math.max(1.5, 5 * alpha);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawFallbackTable(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, this.logicalWidth, this.logicalHeight);
    gradient.addColorStop(0, "#15181b");
    gradient.addColorStop(0.36, "#263233");
    gradient.addColorStop(1, "#090c10");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#d7b14a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const [index, point] of this.model.outline.entries()) {
      const screen = this.worldToScreen(point);
      if (index === 0) {
        ctx.moveTo(screen.x, screen.y);
      } else {
        ctx.lineTo(screen.x, screen.y);
      }
    }
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = "rgba(74, 180, 216, 0.35)";
    ctx.lineWidth = 2;
    for (const edge of this.model.edges.filter((edge) => edge.type === "line").slice(7)) {
      const a = this.worldToScreen(edge.a);
      const b = this.worldToScreen(edge.b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const edge of this.model.edges.filter((edge) => edge.type === "circle")) {
      const center = this.worldToScreen(edge.center);
      const radius = this.screenRadius(edge.center, edge.radius);
      const bumper = ctx.createRadialGradient(center.x - radius * 0.28, center.y - radius * 0.35, 2, center.x, center.y, radius);
      bumper.addColorStop(0, "#fff3b8");
      bumper.addColorStop(0.24, "#f2c14e");
      bumper.addColorStop(0.68, "#b43136");
      bumper.addColorStop(1, "#4a0e15");
      ctx.fillStyle = bumper;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const laneX = this.worldToScreen({ x: this.model.bounds.maxX - 1.2, y: 0 }).x;
    ctx.strokeStyle = "rgba(242, 193, 78, 0.45)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(laneX, 28);
    ctx.lineTo(laneX, this.logicalHeight - 28);
    ctx.stroke();
    ctx.restore();
  }

  drawDebugEdges(ctx) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(81, 200, 120, 0.75)";
    ctx.fillStyle = "rgba(81, 200, 120, 0.14)";
    for (const edge of this.model.edges) {
      if (edge.type === "circle") {
        const center = this.worldToScreen(edge.center);
        const radius = this.screenRadius(edge.center, edge.radius);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const a = this.worldToScreen(edge.a);
        const b = this.worldToScreen(edge.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawFlippers(ctx, flippers) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const flipper of flippers) {
      if (this.drawFlipperSprite(ctx, flipper)) {
        continue;
      }
      const start = this.worldToScreen(flipper.origin);
      const end = this.worldToScreen(flipper.end);
      const width = this.screenRadius(flipper.origin, flipper.radius) * 2.15;
      ctx.strokeStyle = flipper.side === "left" ? "#e84a4a" : "#4ab4d8";
      ctx.lineWidth = Math.max(8, width);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.68)";
      ctx.lineWidth = Math.max(2, width * 0.2);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFlipperSprite(ctx, flipper) {
    const meta = this.model.assetArt?.spriteMeta?.[flipper.sprite];
    const image = this.assetImages[flipper.sprite];
    if (!meta || !image?.complete || !image.naturalWidth) {
      return false;
    }

    const start = this.worldToScreen(flipper.origin);
    const end = this.worldToScreen(flipper.end);
    const targetLength = Math.hypot(end.x - start.x, end.y - start.y);
    const pivot = {
      x: meta.pivot.x * image.naturalWidth,
      y: meta.pivot.y * image.naturalHeight,
    };
    const tip = {
      x: meta.tip.x * image.naturalWidth,
      y: meta.tip.y * image.naturalHeight,
    };
    const baseAngle = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
    const targetAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const spriteLength = Math.hypot(tip.x - pivot.x, tip.y - pivot.y);
    const scale = (targetLength / spriteLength) * (meta.drawScale ?? 1);

    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(targetAngle - baseAngle);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -pivot.x, -pivot.y);
    ctx.restore();
    return true;
  }

  drawBallTrail(ctx, ball) {
    if (!ball.trail.length) {
      return;
    }
    ctx.save();
    for (let i = 0; i < ball.trail.length; i += 1) {
      const point = ball.trail[i];
      const screen = this.worldToScreen({ x: point.x, y: point.y, z: ball.z });
      const alpha = (i + 1) / ball.trail.length;
      ctx.fillStyle = `rgba(242, 193, 78, ${alpha * 0.13})`;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, Math.max(2, this.screenRadius(ball, ball.radius) * alpha * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBall(ctx, ball) {
    const screen = this.worldToScreen({ x: ball.x, y: ball.y, z: ball.z });
    const radius = this.screenRadius(ball, ball.radius);
    const ballSprite = this.assetImages.ball;
    if (ballSprite?.complete && ballSprite.naturalWidth) {
      const size = radius * 2.45;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = radius * 0.45;
      ctx.shadowOffsetY = radius * 0.22;
      ctx.drawImage(ballSprite, screen.x - size / 2, screen.y - size / 2, size, size);
      ctx.restore();
      return;
    }
    const gradient = ctx.createRadialGradient(
      screen.x - radius * 0.35,
      screen.y - radius * 0.42,
      radius * 0.15,
      screen.x,
      screen.y,
      radius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.28, "#dfe7ec");
    gradient.addColorStop(0.64, "#8798a4");
    gradient.addColorStop(1, "#29333c");

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLaunchMeter(ctx, power) {
    const bounds = this.model.playBounds;
    const anchor = this.worldToScreen(this.model.plungerPosition ?? { x: bounds.maxX - 1.2, y: bounds.maxY - 3.5 });
    const height = 70;
    const width = 8;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.fillRect(anchor.x + 14, anchor.y - height, width, height);
    ctx.fillStyle = "#f2c14e";
    ctx.shadowColor = "rgba(242, 193, 78, 0.85)";
    ctx.shadowBlur = 18;
    ctx.fillRect(anchor.x + 14, anchor.y - height * power, width, height * power);
    ctx.restore();
  }

  updateHud(snapshot) {
    this.hud.score.textContent = formatScore(snapshot.score);
    this.hud.ball.textContent = String(snapshot.ball);
    this.hud.mode.textContent = snapshot.mode;
  }
}
