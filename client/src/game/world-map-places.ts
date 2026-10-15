// Pockie Ninja Reborn's world map (WorldMapScene in its main.js, data/reborn-raw/re/main.js
// @2137861): a grey 768x432 painting with one coloured piece per place drawn on top. Art comes from
// tools/fetch-reborn-assets.ts (category "world-map"). Reborn numbers the villages 211/311/411/511;
// `scene` is our id for the same place, `art` the file name.

export const MAP_ART = '/assets/reborn/ui/SmallMap/map'
export const MAP_SIZE = { width: 768, height: 432 }
/** Reborn draws most pieces at this scale. */
const S = 0.95999146

export interface MapPiece {
  scene: number
  art: number
  x: number
  y: number
  scale: number
  /** A place Reborn shows that this game does not have (yet), by its Reborn name: always locked. */
  unavailable?: string
}

const piece = (scene: number, x: number, y: number, scale = S, art = scene): MapPiece => ({
  scene,
  art,
  x,
  y,
  scale,
})
const unavailable = (scene: number, name: string, x: number, y: number, scale = S): MapPiece => ({
  ...piece(scene, x, y, scale),
  unavailable: name,
})

/** Draw order (later pieces lie on top), as in Reborn's place table. */
export const MAP_PIECES: readonly MapPiece[] = [
  piece(2101, 42.95, 302.35),
  piece(111, 75.6, 347.45),
  piece(2103, 109.25, 326.35),
  piece(2102, 63.15, 255.3),
  piece(121, 627.65, 296.55, S, 211),
  piece(2201, 591.1, 287.95),
  piece(2202, 537.35, 246.6),
  piece(2203, 605.55, 246.65),
  piece(2402, 227.3, 268.75),
  piece(2403, 331.95, 303.3),
  piece(2401, 235, 310),
  piece(141, 344.45, 348.4, S, 411),
  piece(2503, 475.95, 138.15),
  piece(151, 580.6, 140.1, S, 511),
  piece(2502, 475, 169.85),
  piece(2501, 592.05, 201.55),
  piece(131, 38.15, 175.6, S, 311),
  piece(2301, 56.45, 220.75),
  piece(2302, 105.4, 215.9),
  piece(2303, 96.75, 166.95),
  piece(171, 350.2, 55.6),
  piece(2605, 306, 109.3),
  piece(161, 306, 128.55),
  piece(2601, 203.3, 179.45),
  piece(2604, 384.75, 171.7),
  piece(2602, 384.75, 117.95),
  piece(2603, 406.85, 139.1),
  piece(2701, 155.3, 100.8),
  piece(2702, 87.15, 95.95),
  piece(2703, 122.7, 70),
  piece(2704, 203.3, 62.35),
  piece(2801, 386.7, 281.2),
  piece(2802, 457.65, 276.4),
  unavailable(2805, 'Village of Sound', 444.3, 310),
  piece(2803, 472.1, 280.25),
  piece(2804, 479.75, 359.9),
  unavailable(2806, 'Konohagakure', 518, 102.1),
  unavailable(4009, 'Valley of the Fallen Warriors', 602.15, 61.95, 1),
  unavailable(2808, 'Naval Headquarters', 161.05, 377, 1),
  unavailable(2807, 'Amazon Island', 69.55, 29.05, 1),
]

/** Pixel size of each piece's art (`art` id). */
const ART_SIZE: Readonly<Record<number, readonly [number, number]>> = {
  111: [90, 62],
  161: [97, 74],
  171: [148, 98],
  211: [92, 48],
  311: [73, 82],
  411: [51, 55],
  511: [135, 83],
  2101: [91, 73],
  2102: [195, 78],
  2103: [81, 56],
  2201: [67, 52],
  2202: [106, 54],
  2203: [133, 74],
  2301: [70, 80],
  2302: [121, 63],
  2303: [152, 74],
  2401: [130, 74],
  2402: [132, 67],
  2403: [120, 63],
  2501: [106, 50],
  2502: [139, 80],
  2503: [150, 71],
  2601: [348, 125],
  2602: [84, 71],
  2603: [79, 39],
  2604: [146, 65],
  2605: [102, 67],
  2701: [166, 60],
  2702: [76, 56],
  2703: [103, 52],
  2704: [52, 41],
  2801: [98, 65],
  2802: [54, 35],
  2803: [105, 72],
  2804: [83, 46],
  2805: [75, 58],
  2806: [83, 46],
  2807: [89, 61],
  2808: [79, 41],
  4009: [100, 67],
}

/** Where a piece lies on the painting. */
export function pieceBox(p: MapPiece) {
  const [w, h] = ART_SIZE[p.art] ?? [0, 0]
  return { left: p.x, top: p.y, width: w * p.scale, height: h * p.scale }
}

/** Centre of the pulsing "you are here" dot of each place (Reborn's table). */
export const HERE_DOT: Readonly<Record<number, readonly [number, number]>> = {
  111: [99.18, 358.11],
  121: [660.63, 310.68],
  131: [55.94, 196.73],
  141: [364.24, 361.85],
  151: [607.16, 165.05],
  161: [343.41, 142.83],
  171: [379.02, 81.58],
  2101: [76, 325.76],
  2102: [125.97, 303.29],
  2103: [174.93, 357.44],
  2201: [621.27, 306.17],
  2202: [602.99, 274.78],
  2203: [650.7, 260.09],
  2301: [74.13, 262.4],
  2302: [139.41, 240.32],
  2303: [145.17, 201.92],
  2401: [259.36, 341.12],
  2402: [301.65, 315.2],
  2403: [381.23, 335.45],
  2501: [650.07, 222.08],
  2502: [514.76, 190.35],
  2503: [574.28, 176],
  2601: [322, 219.58],
  2602: [415.88, 136.59],
  2603: [438.35, 157.33],
  2604: [419.72, 198.99],
  2605: [374.56, 121.81],
  2701: [186.45, 123.25],
  2702: [122.13, 122.24],
  2703: [164.37, 98.24],
  2704: [221.01, 69.44],
  2801: [439.79, 306.6],
  2802: [474.35, 286.49],
  2803: [532, 300.7],
  2804: [519.28, 378.89],
}
