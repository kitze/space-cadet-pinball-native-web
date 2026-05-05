export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (from, to, amount) => from + (to - from) * amount;

export function length(x, y) {
  return Math.hypot(x, y);
}

export function normalize(x, y) {
  const mag = Math.hypot(x, y);
  if (mag <= 1e-9) {
    return { x: 0, y: 0, mag: 0 };
  }
  return { x: x / mag, y: y / mag, mag };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

export function rotatePoint(point, origin, angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return {
    x: x * cos - y * sin + origin.x,
    y: x * sin + y * cos + origin.y,
    z: point.z ?? 0,
  };
}

export function closestPointOnSegment(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-9) {
    return { x: a.x, y: a.y, t: 0 };
  }
  const t = clamp(((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq, 0, 1);
  return {
    x: a.x + abx * t,
    y: a.y + aby * t,
    t,
  };
}

export function angleBetween(origin, from, to) {
  const ax = from.x - origin.x;
  const ay = from.y - origin.y;
  const bx = to.x - origin.x;
  const by = to.y - origin.y;
  const a = normalize(ax, ay);
  const b = normalize(bx, by);
  const cosine = clamp(a.x * b.x + a.y * b.y, -1, 1);
  let angle = Math.acos(cosine);
  if (a.x * b.y - b.x * a.y < 0) {
    angle = -angle;
  }
  return angle;
}
