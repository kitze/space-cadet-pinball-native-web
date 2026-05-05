export type Vec2 = {
  x: number;
  y: number;
};

export type Vec3 = Vec2 & {
  z?: number;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type Ball = Vec3 & {
  z: number;
  vx: number;
  vy: number;
  radius: number;
  trail: Vec2[];
  noCollideTimer?: number;
};

export type LineEdge = {
  type: "line";
  a: Vec2;
  b: Vec2;
  radius: number;
  elasticity: number;
  boost: number;
  score: number;
  groupIndex: number;
  objectType: number;
  name: string;
};

export type CircleEdge = {
  type: "circle";
  center: Vec2;
  radius: number;
  elasticity: number;
  boost: number;
  score: number;
  groupIndex: number;
  objectType: number;
  name: string;
};

export type Edge = LineEdge | CircleEdge;

export type Flipper = {
  side: "left" | "right";
  origin: Vec3;
  source: Vec3;
  target?: Vec3;
  angle: number;
  angleMax: number;
  angularVelocity: number;
  radius: number;
  collisionRadius: number;
  speed: number;
  groupIndex: number;
  name: string;
  sprite?: string;
};

export type SpriteLayer = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

export type DatImageLayer = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rgba: SpriteLayer;
};

export type AssetArt = {
  background: string;
  foreground?: string;
  sprites: Record<string, string>;
  decals: Array<{
    sprite: string;
    x: number;
    y: number;
    width: number;
    rotation?: number;
  }>;
  spriteMeta: Record<
    string,
    {
      pivot: Vec2;
      tip: Vec2;
      drawScale?: number;
    }
  >;
};

export type TableModel = {
  source: string;
  title: string;
  pixelSize: {
    width: number;
    height: number;
  };
  resolution?: number;
  bounds: Bounds;
  playBounds: Bounds;
  outline: Vec2[];
  edges: Edge[];
  flippers: Flipper[];
  images: DatImageLayer[];
  ballRadius: number;
  gravity: Vec2;
  launch?: {
    spawn?: Vec2;
    x: number;
    y: number;
    powerX?: number;
    powerY?: number;
    noCollideTimer?: number;
  };
  drainSlack?: number;
  plungerPosition: Vec2;
  project: null | ((point: Vec3) => Vec2);
  assetArt?: AssetArt;
};

export type HudElements = {
  score: HTMLOutputElement;
  ball: HTMLOutputElement;
  mode: HTMLOutputElement;
};
