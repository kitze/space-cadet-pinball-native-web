// @ts-nocheck
import { normalize } from "./math";

export class CollisionMask {
  constructor(src) {
    this.src = src;
    this.ready = false;
    this.width = 0;
    this.height = 0;
    this.data = null;
    this.solid = null;
    this.load();
  }

  load() {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.width = canvas.width;
      this.height = canvas.height;
      this.data = imageData.data;
      this.solid = new Uint8Array(this.width * this.height);
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const kind = this.pixelKindFromData(x, y);
          this.solid[y * this.width + x] = kind ? 1 : 0;
        }
      }
      this.ready = true;
    };
    image.src = this.src;
  }

  pixelKindFromData(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    const ix = Math.round(x);
    const iy = Math.round(y);
    const offset = (iy * this.width + ix) * 4;
    const r = this.data[offset];
    const g = this.data[offset + 1];
    const b = this.data[offset + 2];
    const max = Math.max(r, g, b);
    if (max < 72) {
      return null;
    }
    if (g > 120 && g > r * 1.25 && g > b * 1.1) {
      return "rail";
    }
    if (b > 120 && g > 100 && r < 80) {
      return "post";
    }
    if (r > 150 && g > 70 && b < 90) {
      return "flipper";
    }
    if (r > 130 && g < 80 && b < 90) {
      return "dead";
    }
    return "rail";
  }

  pixelKind(x, y) {
    if (!this.ready) {
      return null;
    }
    return this.pixelKindFromData(x, y);
  }

  collide(ball) {
    if (!this.ready) {
      return null;
    }

    const searchRadius = Math.ceil(ball.radius + 4);
    const minX = Math.max(0, Math.floor(ball.x - searchRadius));
    const maxX = Math.min(this.width - 1, Math.ceil(ball.x + searchRadius));
    const minY = Math.max(0, Math.floor(ball.y - searchRadius));
    const maxY = Math.min(this.height - 1, Math.ceil(ball.y + searchRadius));
    const radiusSq = ball.radius * ball.radius;
    let closest = null;
    let closestDistSq = Infinity;
    let kind = "rail";

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!this.solid[y * this.width + x]) {
          continue;
        }
        const dx = ball.x - x;
        const dy = ball.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq || distSq >= closestDistSq) {
          continue;
        }
        closestDistSq = distSq;
        closest = { x, y };
      }
    }

    if (!closest) {
      return null;
    }

    for (let y = Math.max(0, closest.y - 1); y <= Math.min(this.height - 1, closest.y + 1); y += 1) {
      for (let x = Math.max(0, closest.x - 1); x <= Math.min(this.width - 1, closest.x + 1); x += 1) {
        const pixelKind = this.pixelKind(x, y);
        if (pixelKind === "post" || pixelKind === "flipper" || pixelKind === "dead") {
          kind = pixelKind;
        }
      }
    }

    const dist = Math.sqrt(closestDistSq);
    const normal = normalize(ball.x - closest.x, ball.y - closest.y);
    if (normal.mag <= 1e-7) {
      return null;
    }

    return {
      kind,
      penetration: ball.radius - dist,
      normal,
      x: closest.x,
      y: closest.y,
    };
  }
}
