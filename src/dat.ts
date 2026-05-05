// @ts-nocheck
const FIELD_SIZES = [2, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0];
const RESOLUTION_TABLE_WIDTH = [600, 752, 960];

export const FieldType = Object.freeze({
  ShortValue: 0,
  Bitmap8bit: 1,
  GroupName: 3,
  Palette: 5,
  String: 9,
  ShortArray: 10,
  FloatArray: 11,
  Bitmap16bit: 12,
});

const BitmapFlag = Object.freeze({
  RawBmpUnaligned: 1,
  DibBitmap: 2,
  Spliced: 4,
});

const decoder = new TextDecoder("latin1");

function readCString(bytes) {
  const zero = bytes.indexOf(0);
  const end = zero >= 0 ? zero : bytes.length;
  return decoder.decode(bytes.subarray(0, end));
}

function viewFor(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function getInt16(bytes, offset) {
  return viewFor(bytes).getInt16(offset, true);
}

function getUint16(bytes, offset) {
  return viewFor(bytes).getUint16(offset, true);
}

function getFloat32(bytes, offset) {
  return viewFor(bytes).getFloat32(offset, true);
}

function parseShortArray(bytes) {
  const out = [];
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    out.push(getInt16(bytes, offset));
  }
  return out;
}

function parseFloatArray(bytes) {
  const out = [];
  for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
    out.push(getFloat32(bytes, offset));
  }
  return out;
}

function makeDefaultPalette() {
  const palette = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const offset = i * 4;
    palette[offset] = i;
    palette[offset + 1] = i;
    palette[offset + 2] = i;
    palette[offset + 3] = i === 0 ? 0 : 255;
  }
  palette[255 * 4] = 255;
  palette[255 * 4 + 1] = 255;
  palette[255 * 4 + 2] = 255;
  palette[255 * 4 + 3] = 255;
  return palette;
}

function buildPalette(rawPalette) {
  const palette = makeDefaultPalette();
  const systemPalette = [
    [0, 0, 0, 0],
    [128, 0, 0, 255],
    [0, 128, 0, 255],
    [128, 128, 0, 255],
    [0, 0, 128, 255],
    [128, 0, 128, 255],
    [0, 128, 128, 255],
    [192, 192, 192, 255],
    [192, 220, 192, 255],
    [166, 202, 240, 255],
  ];

  for (let i = 0; i < systemPalette.length; i += 1) {
    palette.set(systemPalette[i], i * 4);
  }

  if (rawPalette) {
    for (let i = 10; i < 246 && i * 4 + 2 < rawPalette.length; i += 1) {
      const src = i * 4;
      const dst = i * 4;
      palette[dst] = rawPalette[src + 2];
      palette[dst + 1] = rawPalette[src + 1];
      palette[dst + 2] = rawPalette[src];
      palette[dst + 3] = 255;
    }
  }

  palette.set([255, 255, 255, 255], 255 * 4);
  return palette;
}

function bitmapKind(flags) {
  if (flags & BitmapFlag.Spliced) {
    return "spliced";
  }
  if (flags & BitmapFlag.DibBitmap) {
    return "dib";
  }
  return "raw";
}

function indexedStride(width, kind) {
  if (kind === "spliced") {
    return width;
  }
  return width % 4 ? width - (width % 4) + 4 : width;
}

function splitSplicedBitmap(bitmap) {
  const width = bitmap.width;
  const height = bitmap.height;
  const indexed = new Uint8Array(width * height);
  const zData = new Uint16Array(width * height);
  indexed.fill(255);
  zData.fill(0xffff);

  let dstIndex = 0;
  let offset = 0;
  const tableWidth = RESOLUTION_TABLE_WIDTH[bitmap.resolution] ?? width;
  const data = bitmap.indexed;

  while (offset + 1 < data.length) {
    let stride = getInt16(data, offset);
    offset += 2;
    if (stride < 0) {
      break;
    }

    if (stride > width) {
      stride += width - tableWidth;
    }
    dstIndex += Math.max(0, stride);

    if (offset + 1 >= data.length) {
      break;
    }
    const count = getUint16(data, offset);
    offset += 2;

    for (let i = 0; i < count && offset + 2 < data.length; i += 1) {
      const depth = getUint16(data, offset);
      offset += 2;
      const pixel = data[offset];
      offset += 1;
      if (dstIndex >= 0 && dstIndex < indexed.length) {
        indexed[dstIndex] = pixel;
        zData[dstIndex] = depth;
      }
      dstIndex += 1;
    }
  }

  return {
    bitmap: {
      ...bitmap,
      kind: "dib",
      indexed,
      indexedStride: width,
      size: indexed.length,
      rgba: null,
    },
    zMap: {
      width,
      height,
      stride: width,
      resolution: bitmap.resolution,
      data: zData,
    },
  };
}

export class PinballDat {
  static async fromFile(file, options = {}) {
    const buffer = await file.arrayBuffer();
    const inferredFullTilt = /cadet|demo/i.test(file.name);
    return new PinballDat(buffer, {
      fullTiltMode: inferredFullTilt,
      fileName: file.name,
      ...options,
    });
  }

  constructor(buffer, options = {}) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.fullTiltMode = Boolean(options.fullTiltMode);
    this.fileName = options.fileName ?? "PINBALL.DAT";
    this.groups = [];
    this.palette = makeDefaultPalette();
    this.header = null;
    this.parse();
    this.finalize();
  }

  parse() {
    if (this.bytes.length < 183) {
      throw new Error("DAT file is too small.");
    }

    this.header = {
      signature: readCString(this.bytes.subarray(0, 21)),
      appName: readCString(this.bytes.subarray(21, 71)),
      description: readCString(this.bytes.subarray(71, 171)),
      fileSize: this.view.getInt32(171, true),
      groupCount: this.view.getUint16(175, true),
      bodySize: this.view.getInt32(177, true),
      unknownSize: this.view.getUint16(181, true),
    };

    if (this.header.signature !== "PARTOUT(4.0)RESOURCE") {
      throw new Error("Unsupported DAT signature.");
    }

    let offset = 183 + this.header.unknownSize;
    for (let groupIndex = 0; groupIndex < this.header.groupCount; groupIndex += 1) {
      const entryCount = this.bytes[offset];
      offset += 1;
      const group = {
        id: groupIndex,
        name: "",
        entries: [],
        bitmaps: new Map(),
        zMaps: new Map(),
      };

      for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
        const type = this.bytes[offset];
        offset += 1;
        const fixedSize = FIELD_SIZES[type] ?? -1;
        let fieldSize = fixedSize >= 0 ? fixedSize : this.view.getUint32(offset, true);
        if (fixedSize < 0) {
          offset += 4;
        }

        if (type === FieldType.Bitmap8bit) {
          const header = this.parseBitmapHeader(offset);
          offset += 14;
          const indexed = this.bytes.slice(offset, offset + header.size);
          offset += header.size;
          group.entries.push({
            type,
            fieldSize,
            bitmap: {
              ...header,
              indexed,
              indexedStride: indexedStride(header.width, header.kind),
              rgba: null,
            },
          });
        } else if (type === FieldType.Bitmap16bit) {
          let resolution = 0;
          if (this.fullTiltMode) {
            resolution = this.bytes[offset];
            offset += 1;
            fieldSize -= 1;
            if (resolution === 0xff) {
              resolution = 0;
            }
          }

          const width = this.view.getInt16(offset, true);
          const height = this.view.getInt16(offset + 2, true);
          const stride = this.view.getInt16(offset + 4, true);
          offset += 14;

          const dataLength = fieldSize - 14;
          const dataBytes = this.bytes.slice(offset, offset + Math.max(0, dataLength));
          offset += Math.max(0, dataLength);
          const zMap = {
            width,
            height,
            stride,
            resolution,
            data: new Uint16Array(Math.max(0, Math.floor(dataBytes.length / 2))),
          };
          for (let i = 0; i < zMap.data.length; i += 1) {
            zMap.data[i] = getUint16(dataBytes, i * 2);
          }
          group.entries.push({ type, fieldSize, zMap });
        } else {
          const data = this.bytes.slice(offset, offset + fieldSize);
          offset += fieldSize;
          group.entries.push({ type, fieldSize, data });
        }
      }
      this.groups.push(group);
    }
  }

  parseBitmapHeader(offset) {
    const resolution = this.bytes[offset];
    const width = this.view.getInt16(offset + 1, true);
    const height = this.view.getInt16(offset + 3, true);
    const x = this.view.getInt16(offset + 5, true);
    const y = this.view.getInt16(offset + 7, true);
    const size = this.view.getInt32(offset + 9, true);
    const flags = this.bytes[offset + 13];
    return {
      resolution,
      width,
      height,
      x,
      y,
      size,
      flags,
      kind: bitmapKind(flags),
    };
  }

  finalize() {
    for (const group of this.groups) {
      for (const entry of group.entries) {
        if (entry.type === FieldType.GroupName) {
          group.name = readCString(entry.data);
        }
      }
    }

    const paletteEntry = this.fieldByName("background", FieldType.Palette);
    this.palette = buildPalette(paletteEntry);

    for (const group of this.groups) {
      for (const entry of group.entries) {
        if (entry.type === FieldType.Bitmap8bit) {
          if (entry.bitmap.kind === "spliced") {
            const split = splitSplicedBitmap(entry.bitmap);
            group.bitmaps.set(split.bitmap.resolution, split.bitmap);
            group.zMaps.set(split.zMap.resolution, split.zMap);
          } else {
            group.bitmaps.set(entry.bitmap.resolution, entry.bitmap);
          }
        } else if (entry.type === FieldType.Bitmap16bit) {
          group.zMaps.set(entry.zMap.resolution, entry.zMap);
        }
      }
    }
  }

  recordLabeled(name) {
    for (let i = this.groups.length - 1; i >= 0; i -= 1) {
      if (this.groups[i].name === name) {
        return i;
      }
    }
    return -1;
  }

  group(index) {
    return index >= 0 && index < this.groups.length ? this.groups[index] : null;
  }

  field(groupIndex, type, nth = 0) {
    const group = this.group(groupIndex);
    if (!group) {
      return null;
    }
    let seen = 0;
    for (const entry of group.entries) {
      if (entry.type === type) {
        if (seen === nth) {
          return entry.data ?? null;
        }
        seen += 1;
      }
    }
    return null;
  }

  fieldSize(groupIndex, type, nth = 0) {
    const group = this.group(groupIndex);
    if (!group) {
      return 0;
    }
    let seen = 0;
    for (const entry of group.entries) {
      if (entry.type === type) {
        if (seen === nth) {
          return entry.fieldSize;
        }
        seen += 1;
      }
    }
    return 0;
  }

  fieldByName(name, type) {
    const index = this.recordLabeled(name);
    return index < 0 ? null : this.field(index, type);
  }

  stringField(groupIndex, type = FieldType.GroupName) {
    const bytes = this.field(groupIndex, type);
    return bytes ? readCString(bytes) : "";
  }

  shortArrays(groupIndex) {
    const group = this.group(groupIndex);
    if (!group) {
      return [];
    }
    return group.entries
      .filter((entry) => entry.type === FieldType.ShortArray)
      .map((entry) => parseShortArray(entry.data));
  }

  floatArrays(groupIndex) {
    const group = this.group(groupIndex);
    if (!group) {
      return [];
    }
    return group.entries
      .filter((entry) => entry.type === FieldType.FloatArray)
      .map((entry) => parseFloatArray(entry.data));
  }

  shortValue(groupIndex) {
    const bytes = this.field(groupIndex, FieldType.ShortValue);
    return bytes ? getInt16(bytes, 0) : null;
  }

  bitmapFor(groupIndex, resolution = 0) {
    const group = this.group(groupIndex);
    if (!group) {
      return null;
    }
    return group.bitmaps.get(resolution) ?? group.bitmaps.values().next().value ?? null;
  }

  zMapFor(groupIndex, resolution = 0) {
    const group = this.group(groupIndex);
    if (!group) {
      return null;
    }
    return group.zMaps.get(resolution) ?? group.zMaps.values().next().value ?? null;
  }

  bitmapToRgba(bitmap) {
    if (!bitmap) {
      return null;
    }
    if (bitmap.rgba) {
      return bitmap.rgba;
    }

    const rgba = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
    for (let destY = 0; destY < bitmap.height; destY += 1) {
      const srcY = bitmap.height - 1 - destY;
      const srcRow = srcY * bitmap.indexedStride;
      const dstRow = destY * bitmap.width * 4;
      for (let x = 0; x < bitmap.width; x += 1) {
        const colorIndex = bitmap.indexed[srcRow + x] ?? 0;
        const src = colorIndex * 4;
        const dst = dstRow + x * 4;
        rgba[dst] = this.palette[src];
        rgba[dst + 1] = this.palette[src + 1];
        rgba[dst + 2] = this.palette[src + 2];
        rgba[dst + 3] = this.palette[src + 3];
      }
    }

    bitmap.rgba = {
      width: bitmap.width,
      height: bitmap.height,
      rgba,
    };
    return bitmap.rgba;
  }
}
