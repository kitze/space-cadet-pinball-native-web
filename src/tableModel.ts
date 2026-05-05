// @ts-nocheck
import { FieldType } from "./dat";
import { angleBetween } from "./math";

const RESOLUTION_INFO = [
  { width: 600, height: 416 },
  { width: 752, height: 520 },
  { width: 960, height: 666 },
];

const ObjectType = Object.freeze({
  Wall: 1000,
  Plunger: 1001,
  Bumper: 1005,
  Drain: 1007,
  RampWall: 1010,
  Kickout: 1012,
  Gate: 1013,
  Kickback: 1014,
  Rollover: 1015,
  OneWay: 1016,
  Sink: 1017,
  FlagSpinner: 1018,
  SoloTarget: 1019,
  LightRollover: 1020,
  Ramp: 1021,
  Hole: 1022,
  Tripwire: 1024,
  LeftFlipper: 1003,
  RightFlipper: 1004,
});

function hasBitmap(dat, groupIndex, resolution) {
  const group = dat.group(groupIndex);
  return Boolean(group?.bitmaps?.has(resolution));
}

function getNamedBitmap(dat, name, resolution) {
  const groupIndex = dat.recordLabeled(name);
  return groupIndex < 0 ? null : dat.bitmapFor(groupIndex, resolution);
}

export function queryVisualStates(dat, groupIndex) {
  const firstShortArray = dat.shortArrays(groupIndex)[0];
  if (firstShortArray?.[0] === 100) {
    return firstShortArray[1] ?? 1;
  }
  return 1;
}

export function stateId(dat, groupIndex, stateOffset = 0) {
  if (groupIndex < 0) {
    return -1;
  }
  if (stateOffset === 0) {
    return groupIndex;
  }
  const states = queryVisualStates(dat, groupIndex);
  if (stateOffset > states) {
    return -1;
  }
  return groupIndex + stateOffset;
}

export function queryFloatAttribute(dat, groupIndex, stateOffset, attributeId) {
  const id = stateId(dat, groupIndex, stateOffset);
  if (id < 0) {
    return null;
  }
  for (const floats of dat.floatArrays(id)) {
    if (Math.floor(floats[0]) === attributeId) {
      return floats.slice(1);
    }
  }
  return null;
}

export function queryIAttribute(dat, groupIndex, attributeId) {
  for (const shorts of dat.shortArrays(groupIndex)) {
    if (shorts[0] === attributeId) {
      return shorts.slice(1);
    }
  }
  return null;
}

export function queryVisual(dat, groupIndex, stateOffset = 0, resolution = 0) {
  const id = stateId(dat, groupIndex, stateOffset);
  if (id < 0) {
    return null;
  }
  const wallFloatArray = dat.floatArrays(id).find((floats) => Math.floor(floats[0]) === 600);
  return {
    stateId: id,
    bitmap: dat.bitmapFor(id, resolution),
    zMap: dat.zMapFor(id, resolution),
    floatArr: wallFloatArray ? wallFloatArray.slice(2) : [],
    rawWall: wallFloatArray ? wallFloatArray.slice(1) : null,
  };
}

function createProjection(dat, resolution, pixelSize) {
  const cameraBase = dat.recordLabeled("camera_info");
  if (cameraBase < 0) {
    return null;
  }

  const cameraFloats = dat.floatArrays(cameraBase + resolution)[0];
  if (!cameraFloats || cameraFloats.length < 15) {
    return null;
  }

  let centerX = pixelSize.width * 0.5;
  let centerY = pixelSize.height * 0.5;
  const tableGroup = dat.recordLabeled("table");
  const center = queryFloatAttribute(dat, tableGroup, 0, 700 + resolution);
  if (center && center.length >= 2) {
    centerX = center[0];
    centerY = center[1];
  }

  const d = cameraFloats[12];
  return function project(point) {
    const x = point.x;
    const y = point.y;
    const z = point.z ?? 0;
    const projX = z * cameraFloats[2] + y * cameraFloats[1] + x * cameraFloats[0] + cameraFloats[3];
    const projY = z * cameraFloats[6] + y * cameraFloats[5] + x * cameraFloats[4] + cameraFloats[7];
    const projZ = z * cameraFloats[10] + y * cameraFloats[9] + x * cameraFloats[8] + cameraFloats[11];
    const coefficient = projZ === 0 ? 999999.88 : d / projZ;
    return {
      x: projX * coefficient + centerX,
      y: projY * coefficient + centerY,
    };
  };
}

function boundsFromPoints(points, fallback) {
  if (!points.length) {
    return fallback;
  }
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function pointsFromFloatPairs(values) {
  const points = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    points.push({ x: values[i], y: values[i + 1] });
  }
  return points;
}

function lineEdge(a, b, meta = {}) {
  return {
    type: "line",
    key: meta.key,
    a,
    b,
    radius: meta.radius ?? 0,
    elasticity: meta.elasticity ?? 0.72,
    boost: meta.boost ?? 0,
    score: meta.score ?? 5,
    groupIndex: meta.groupIndex ?? -1,
    objectType: meta.objectType ?? 0,
    name: meta.name ?? "",
  };
}

function circleEdge(center, radius, meta = {}) {
  return {
    type: "circle",
    key: meta.key,
    center,
    radius,
    elasticity: meta.elasticity ?? 0.82,
    boost: meta.boost ?? 0,
    score: meta.score ?? 15,
    groupIndex: meta.groupIndex ?? -1,
    objectType: meta.objectType ?? 0,
    name: meta.name ?? "",
  };
}

function addPolylineEdges(edges, key, points, meta = {}) {
  for (let i = 0; i + 1 < points.length; i += 1) {
    edges.push(
      lineEdge(points[i], points[i + 1], {
        ...meta,
        key: `${key}-${i}`,
      }),
    );
  }
}

function edgesFromWallAttribute(attr, meta = {}) {
  if (!attr || attr.length < 2) {
    return [];
  }

  const wallKind = Math.floor(attr[0]) - 1;
  if (wallKind === 0 && attr.length >= 4) {
    return [circleEdge({ x: attr[1], y: attr[2] }, Math.max(0.01, attr[3]), meta)];
  }
  if (wallKind === 1 && attr.length >= 5) {
    return [lineEdge({ x: attr[1], y: attr[2] }, { x: attr[3], y: attr[4] }, meta)];
  }

  const vertexCount = Math.max(0, wallKind);
  const vertices = [];
  for (let i = 0; i < vertexCount && 1 + i * 2 + 1 < attr.length; i += 1) {
    vertices.push({ x: attr[1 + i * 2], y: attr[2 + i * 2] });
  }
  const edges = [];
  for (let i = 0; i < vertices.length; i += 1) {
    edges.push(lineEdge(vertices[i], vertices[(i + 1) % vertices.length], meta));
  }
  return edges;
}

function createFlipperFromDat(dat, groupIndex, objectType, ballRadius) {
  const originRaw = queryFloatAttribute(dat, groupIndex, 0, 800);
  const t1Raw = queryFloatAttribute(dat, groupIndex, 0, 801);
  const t2Raw = queryFloatAttribute(dat, groupIndex, 0, 802);
  if (!originRaw || !t1Raw || !t2Raw) {
    return null;
  }

  const origin = { x: originRaw[0], y: originRaw[1], z: originRaw[2] ?? 0 };
  const source = { x: t1Raw[0], y: t1Raw[1], z: t1Raw[2] ?? 0 };
  const target = { x: t2Raw[0], y: t2Raw[1], z: t2Raw[2] ?? 0 };
  const angleMax = angleBetween(origin, source, target);
  const width = Math.max(origin.z, source.z, 0.12);
  return {
    side: objectType === ObjectType.LeftFlipper ? "left" : "right",
    origin,
    source,
    target,
    angle: 0,
    angleMax,
    angularVelocity: 0,
    radius: Math.max(0.1, width),
    collisionRadius: Math.max(0.12, width + ballRadius * 0.2),
    speed: Math.max(7, Math.abs(angleMax) * 10),
    groupIndex,
    name: dat.group(groupIndex)?.name ?? "",
  };
}

function chooseResolution(dat) {
  const background = dat.recordLabeled("background");
  const table = dat.recordLabeled("table");
  for (const resolution of [2, 1, 0]) {
    if (hasBitmap(dat, background, resolution) || hasBitmap(dat, table, resolution)) {
      return resolution;
    }
  }
  return 0;
}

function objectMeta(dat, groupIndex, objectType) {
  const bumperLike = objectType === ObjectType.Bumper || objectType === ObjectType.Kickout;
  return {
    groupIndex,
    objectType,
    name: dat.group(groupIndex)?.name ?? "",
    elasticity: bumperLike ? 0.92 : 0.72,
    boost: bumperLike ? 4.5 : 0,
    score: bumperLike ? 100 : 10,
  };
}

function imageLayer(dat, name, bitmap) {
  const rgba = dat.bitmapToRgba(bitmap);
  if (!rgba) {
    return null;
  }
  return {
    name,
    x: bitmap.x,
    y: bitmap.y,
    width: bitmap.width,
    height: bitmap.height,
    rgba,
  };
}

export function createFallbackModel() {
  const bounds = { minX: 58, minY: 50, maxX: 883, maxY: 1608 };
  const ballRadius = 23;
  const outline = [
    { x: 88, y: 70 },
    { x: 838, y: 70 },
    { x: 905, y: 1510 },
    { x: 666, y: 1620 },
    { x: 470, y: 1538 },
    { x: 274, y: 1620 },
    { x: 38, y: 1510 },
  ];
  const edges = [];
  for (let i = 0; i < outline.length; i += 1) {
    edges.push(lineEdge(outline[i], outline[(i + 1) % outline.length], { key: `outline-${i}`, score: 0, elasticity: 0.72 }));
  }

  edges.push(circleEdge({ x: 180, y: 190 }, 54, { key: "bumper-top-left", boost: 170, score: 100, elasticity: 0.9 }));
  edges.push(circleEdge({ x: 510, y: 378 }, 55, { key: "bumper-top-mid", boost: 170, score: 100, elasticity: 0.9 }));
  edges.push(circleEdge({ x: 650, y: 382 }, 55, { key: "bumper-top-right", boost: 170, score: 100, elasticity: 0.9 }));
  edges.push(circleEdge({ x: 525, y: 535 }, 58, { key: "bumper-center", boost: 170, score: 100, elasticity: 0.9 }));
  edges.push(circleEdge({ x: 472, y: 962 }, 116, { key: "gravity-well", boost: 80, score: 15, elasticity: 0.62 }));
  addPolylineEdges(edges, "left-outer-rail", [
    { x: 76, y: 1488 },
    { x: 76, y: 1160 },
    { x: 96, y: 815 },
    { x: 126, y: 560 },
    { x: 168, y: 320 },
    { x: 248, y: 142 },
    { x: 385, y: 88 },
  ], { radius: 12, elasticity: 0.78, score: 0 });
  addPolylineEdges(edges, "top-outer-rail", [
    { x: 385, y: 88 },
    { x: 560, y: 78 },
    { x: 724, y: 118 },
    { x: 830, y: 245 },
  ], { radius: 12, elasticity: 0.78, score: 0 });
  addPolylineEdges(edges, "right-outer-rail", [
    { x: 830, y: 245 },
    { x: 864, y: 500 },
    { x: 866, y: 905 },
    { x: 848, y: 1284 },
    { x: 816, y: 1488 },
  ], { radius: 14, elasticity: 0.78, score: 0 });
  addPolylineEdges(edges, "launch-lane-inner", [
    { x: 802, y: 320 },
    { x: 820, y: 760 },
    { x: 806, y: 1206 },
    { x: 782, y: 1500 },
  ], { radius: 10, elasticity: 0.74, score: 0 });
  addPolylineEdges(edges, "left-return-guide", [
    { x: 88, y: 1266 },
    { x: 170, y: 1340 },
    { x: 255, y: 1414 },
  ], { radius: 14, elasticity: 0.78, score: 0 });
  addPolylineEdges(edges, "right-return-guide", [
    { x: 852, y: 1266 },
    { x: 770, y: 1340 },
    { x: 685, y: 1414 },
  ], { radius: 14, elasticity: 0.78, score: 0 });
  addPolylineEdges(edges, "left-slingshot", [
    { x: 172, y: 1136 },
    { x: 260, y: 1214 },
    { x: 365, y: 1326 },
  ], { radius: 16, boost: 70, score: 25, elasticity: 0.84 });
  addPolylineEdges(edges, "right-slingshot", [
    { x: 768, y: 1136 },
    { x: 680, y: 1214 },
    { x: 575, y: 1326 },
  ], { radius: 16, boost: 70, score: 25, elasticity: 0.84 });
  addPolylineEdges(edges, "left-upper-guide", [
    { x: 118, y: 548 },
    { x: 184, y: 652 },
    { x: 346, y: 704 },
  ], { radius: 13, boost: 28, score: 10, elasticity: 0.8 });
  addPolylineEdges(edges, "right-upper-guide", [
    { x: 802, y: 548 },
    { x: 748, y: 652 },
    { x: 590, y: 708 },
  ], { radius: 13, boost: 28, score: 10, elasticity: 0.8 });

  const flippers = [
    {
      side: "left",
      origin: { x: 270, y: 1456, z: 0 },
      source: { x: 405, y: 1396, z: 0 },
      target: { x: 380, y: 1272, z: 0 },
      angle: 0,
      angleMax: 0,
      angularVelocity: 0,
      radius: 18,
      collisionRadius: 25,
      speed: 10,
      groupIndex: -1,
      name: "left_flipper",
      sprite: "flipperLeft",
    },
    {
      side: "right",
      origin: { x: 672, y: 1456, z: 0 },
      source: { x: 537, y: 1396, z: 0 },
      target: { x: 562, y: 1272, z: 0 },
      angle: 0,
      angleMax: 0,
      angularVelocity: 0,
      radius: 18,
      collisionRadius: 25,
      speed: 10,
      groupIndex: -1,
      name: "right_flipper",
      sprite: "flipperRight",
    },
  ];
  for (const flipper of flippers) {
    flipper.angleMax = angleBetween(flipper.origin, flipper.source, flipper.target);
  }

  return {
    source: "imagegen",
    title: "Layered imagegen table",
    pixelSize: { width: 941, height: 1672 },
    bounds,
    playBounds: bounds,
    outline,
    edges,
    flippers,
    images: [],
    ballRadius,
    gravity: { x: 18, y: 740 },
    maxBallSpeed: 2100,
    launch: { x: -70, y: -1320, powerX: -120, powerY: -620, noCollideTimer: 0.36 },
    drainSlack: 72,
    plungerPosition: { x: 864, y: 1452 },
    project: null,
    assetArt: {
      background: "./assets/generated/playfield.png",
      foreground: "./assets/generated/playfield-occluders-alpha.png",
      foregroundOpacity: 0,
      collisionGuide: "./assets/generated/collision-guide-v1.png",
      sprites: {
        ball: "./assets/sprites/ball.png",
        flipperLeft: "./assets/sprites/flipper-right.png",
        flipperRight: "./assets/sprites/flipper-left.png",
        bumper: "./assets/sprites/bumper.png",
        arrow: "./assets/sprites/arrow-insert.png",
        lamp: "./assets/sprites/orange-lamp.png",
      },
      decals: [],
      spriteMeta: {
        flipperLeft: {
          pivot: { x: 0.18, y: 0.74 },
          tip: { x: 0.88, y: 0.16 },
          drawScale: 0.82,
        },
        flipperRight: {
          pivot: { x: 0.82, y: 0.74 },
          tip: { x: 0.12, y: 0.16 },
          drawScale: 0.82,
        },
      },
    },
  };
}

export function createModelFromDat(dat) {
  const resolution = chooseResolution(dat);
  const backgroundBitmap = getNamedBitmap(dat, "background", resolution);
  const tableGroup = dat.recordLabeled("table");
  const tableVisual = tableGroup >= 0 ? queryVisual(dat, tableGroup, 0, resolution) : null;
  const tableBitmap = tableVisual?.bitmap ?? getNamedBitmap(dat, "table", resolution);
  const resolutionInfo = RESOLUTION_INFO[resolution] ?? RESOLUTION_INFO[0];
  const pixelSize = {
    width: tableBitmap?.width || backgroundBitmap?.width || resolutionInfo.width,
    height: tableBitmap?.height || backgroundBitmap?.height || resolutionInfo.height,
  };

  const ballGroup = dat.recordLabeled("ball") >= 0 ? dat.recordLabeled("ball") : dat.recordLabeled(`ball${resolution}`);
  const ballRadius = queryFloatAttribute(dat, ballGroup, 0, 500)?.[0] ?? 0.34;
  const outline = pointsFromFloatPairs(tableVisual?.floatArr ?? []);
  const fallback = createFallbackModel();
  const bounds = boundsFromPoints(outline, fallback.bounds);
  const edges = [];

  if (outline.length >= 3) {
    for (let i = 0; i < outline.length; i += 1) {
      edges.push(lineEdge(outline[i], outline[(i + 1) % outline.length], { score: 1, elasticity: 0.7, name: "table" }));
    }
  }

  const tableObjectsGroup = dat.recordLabeled("table_objects");
  const tableObjects = tableObjectsGroup >= 0 ? queryIAttribute(dat, tableObjectsGroup, 1025) : null;
  const flippers = [];
  if (tableObjects) {
    for (let i = 0; i + 1 < tableObjects.length; i += 2) {
      const objectType = tableObjects[i];
      const groupIndex = tableObjects[i + 1];
      if (objectType === ObjectType.LeftFlipper || objectType === ObjectType.RightFlipper) {
        const flipper = createFlipperFromDat(dat, groupIndex, objectType, ballRadius);
        if (flipper) {
          flippers.push(flipper);
        }
        continue;
      }

      const attr = queryFloatAttribute(dat, groupIndex, 0, 600);
      if (attr) {
        edges.push(...edgesFromWallAttribute(attr, objectMeta(dat, groupIndex, objectType)));
      }
    }
  }

  const images = [
    backgroundBitmap ? imageLayer(dat, "background", backgroundBitmap) : null,
    tableBitmap ? imageLayer(dat, "table", tableBitmap) : null,
  ].filter(Boolean);

  const model = {
    source: "dat",
    title: `${dat.fileName} · ${resolutionInfo.width}x${resolutionInfo.height}`,
    pixelSize,
    resolution,
    bounds,
    playBounds: bounds,
    outline,
    edges: edges.length ? edges : fallback.edges,
    flippers: flippers.length ? flippers : fallback.flippers,
    images,
    ballRadius,
    gravity: { x: 0.25, y: 13.6 },
    plungerPosition: queryFloatAttribute(dat, dat.recordLabeled("plunger"), 0, 601)?.length
      ? {
          x: queryFloatAttribute(dat, dat.recordLabeled("plunger"), 0, 601)[0],
          y: queryFloatAttribute(dat, dat.recordLabeled("plunger"), 0, 601)[1],
        }
      : { x: bounds.maxX - 1.2, y: bounds.maxY - 3.6 },
    project: null,
  };

  model.project = createProjection(dat, resolution, pixelSize);
  return model;
}
