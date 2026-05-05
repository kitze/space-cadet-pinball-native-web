// @ts-nocheck
import { normalize } from "./math";

export class CollisionMask {
  constructor(src) {
    this.src = src;
    this.ready = false;
    this.width = 0;
    this.height = 0;
    this.data = null;
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
      this.ready = true;
    };
    image.src = this.src;
  }

  pixelKind(x, y) {
    if (!this.ready || x < 0 || y < 0 || x >= this.width || y >= this.height) {
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

  collide(ball) {
    if (!this.ready) {
      return null;
    }

    const samples = 40;
    let nx = 0;
    let ny = 0;
    let hits = 0;
    let kind = "rail";
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const sx = ball.x + Math.cos(angle) * ball.radius;
      const sy = ball.y + Math.sin(angle) * ball.radius;
      const pixelKind = this.pixelKind(sx, sy);
      if (!pixelKind) {
        continue;
      }
      nx += ball.x - sx;
      ny += ball.y - sy;
      hits += 1;
      if (pixelKind === "post" || pixelKind === "flipper") {
        kind = pixelKind;
      } else if (pixelKind === "dead") {
        kind = "dead";
      }
    }

    if (!hits) {
      return null;
    }

    const normal = normalize(nx, ny);
    if (normal.mag <= 1e-7) {
      return null;
    }

    return {
      kind,
      hits,
      normal,
      x: ball.x - normal.x * ball.radius,
      y: ball.y - normal.y * ball.radius,
    };
  }
}
