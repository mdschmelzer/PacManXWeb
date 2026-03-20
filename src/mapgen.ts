import { TILE_SIZE, WALL_SIZE, TILE } from './constants';

// ---------------------------------------------------------------------------
// Map generation
// Faithfully ported from VB.NET MapInitialize().
// The adjacency rules ensure every corridor connection is valid.
// ---------------------------------------------------------------------------


// Right-open set for adjacency checks (tiles that have an open right corridor exit)
const HAS_RIGHT_EXIT  = [2, 3, 4, 5, 7, 9, 11];
// Tiles that have an open bottom corridor exit
const HAS_BOTTOM_EXIT = [1, 3, 4, 6, 7, 8, 11];

function rightOpen(t: number): boolean  { return HAS_RIGHT_EXIT.includes(t); }
function bottomOpen(t: number): boolean { return HAS_BOTTOM_EXIT.includes(t); }

/**
 * Generate a random map matrix of size sizeX × sizeY.
 * Returns a 2-D array [x][y] of tile-type integers.
 */
export function generateMap(sizeX: number, sizeY: number): number[][] {
  const m: number[][] = Array.from({ length: sizeX }, () => new Array(sizeY).fill(-1));

  let i = 0, j = 0;
  let resetting = false;

  outer: while (j < sizeY) {
    while (i < sizeX) {
      // Fixed corner tiles
      if (i === 0        && j === 0)        { m[i][j] = TILE.TL; i++; continue; }
      if (i === sizeX-1  && j === 0)        { m[i][j] = TILE.TR; i++; continue; }
      if (i === 0        && j === sizeY-1)  { m[i][j] = TILE.BL; i++; continue; }
      if (i === sizeX-1  && j === sizeY-1)  { m[i][j] = TILE.BR; i++; continue; }

      // Try up to 200 random candidates before resetting whole map
      let placed = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const n = Math.floor(Math.random() * 12); // 0..11
        if (tryPlace(m, n, i, j, sizeX, sizeY)) {
          m[i][j] = n;
          placed = true;
          break;
        }
      }

      if (!placed) {
        // Full reset — restart map generation
        for (let x = 0; x < sizeX; x++) m[x].fill(-1);
        i = 0; j = 0;
        resetting = true;
        continue outer;
      }

      i++;
    }
    i = 0;
    j++;
  }

  void resetting; // suppress unused warning
  return m;
}

/**
 * Check whether tile type `n` is valid at position (i,j) given already-placed neighbors.
 * Ported directly from the VB.NET adjacency if-else chains.
 */
function tryPlace(m: number[][], n: number, i: number, j: number, sizeX: number, sizeY: number): boolean {
  const li = i > 0       ? m[i-1][j] : -1; // left neighbor
  const aj = j > 0       ? m[i][j-1] : -1; // above neighbor

  // Corners are handled before calling this
  const isLastX = i === sizeX - 1;
  const isLastY = j === sizeY - 1;

  // ---------- Second-to-last column, top row ----------
  if (i === sizeX-2 && j === 0) {
    if (n === TILE.TL && !rightOpen(li)) return true;
    if ((n === TILE.TOP || n === TILE.HORIZ) && rightOpen(li)) return true;
    return false;
  }
  // ---------- Left col, second-to-last row ----------
  if (i === 0 && j === sizeY-2) {
    if (n === TILE.TL && !bottomOpen(aj)) return true;
    if ((n === TILE.LEFT || n === TILE.VERT) && bottomOpen(aj)) return true;
    return false;
  }
  // ---------- Second-to-last col, last row ----------
  if (i === sizeX-2 && j === sizeY-1) {
    if (n === TILE.BL && !rightOpen(li)  && bottomOpen(aj)) return true;
    if (n === TILE.BOTTOM && rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.HORIZ && rightOpen(li) && !bottomOpen(aj)) return true;
    return false;
  }
  // ---------- Last col, second-to-last row ----------
  if (i === sizeX-1 && j === sizeY-2) {
    if (n === TILE.RIGHT  && rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.VERT   && !rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.TR     && rightOpen(li) && !bottomOpen(aj)) return true;
    return false;
  }

  // ---------- Top row (j === 0, i is inner) ----------
  if (j === 0) {
    if ((n === TILE.EMPTY || n === TILE.TL) && !rightOpen(li)) return true;
    if ((n === TILE.TOP || n === TILE.HORIZ || n === TILE.TR) && rightOpen(li)) return true;
    return false;
  }
  // ---------- Left column (i === 0, j is inner) ----------
  if (i === 0) {
    if ((n === TILE.EMPTY || n === TILE.TL) && !bottomOpen(aj)) return true;
    if ((n === TILE.LEFT || n === TILE.VERT || n === TILE.BL) && bottomOpen(aj)) return true;
    return false;
  }
  // ---------- Right column (last col, inner rows) ----------
  if (isLastX) {
    if (n === TILE.EMPTY && !rightOpen(li) && !bottomOpen(aj)) return true;
    if ((n === TILE.RIGHT || n === TILE.BR) && rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.VERT  && !rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.TR    && rightOpen(li) && !bottomOpen(aj)) return true;
    return false;
  }
  // ---------- Bottom row (last row, inner cols) ----------
  if (isLastY) {
    if (n === TILE.EMPTY && !rightOpen(li) && !bottomOpen(aj)) return true;
    if ((n === TILE.BOTTOM || n === TILE.BR) && rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.BL    && !rightOpen(li) && bottomOpen(aj)) return true;
    if (n === TILE.HORIZ && rightOpen(li) && !bottomOpen(aj)) return true;
    return false;
  }

  // ---------- Interior tiles ----------
  if ((n === TILE.EMPTY || n === TILE.TL) && !rightOpen(li) && !bottomOpen(aj)) return true;
  if ((n === TILE.RIGHT || n === TILE.BOTTOM || n === TILE.BR || n === TILE.OPEN) && rightOpen(li) && bottomOpen(aj)) return true;
  if ((n === TILE.LEFT  || n === TILE.VERT  || n === TILE.BL) && !rightOpen(li) && bottomOpen(aj)) return true;
  if ((n === TILE.TOP   || n === TILE.HORIZ || n === TILE.TR) && rightOpen(li) && !bottomOpen(aj)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Collision map
// ---------------------------------------------------------------------------

const WALL_R = TILE_SIZE - WALL_SIZE; // 35

/**
 * Return true if the pixel at local coordinates (lx, ly) within a tile of
 * the given type is a wall pixel.
 */
function isWallPixel(
  tileType: number,
  tileX: number, tileY: number,
  sizeX: number, sizeY: number,
  lx: number, ly: number
): boolean {
  const W = WALL_SIZE;

  if (tileType === TILE.EMPTY) {
    // Interior type-0: fully open
    if (tileX !== 0 && tileY !== 0 && tileX !== sizeX-1 && tileY !== sizeY-1) return false;
    if (tileX === 0)        return lx < W;
    if (tileY === 0)        return ly < W;
    if (tileX === sizeX-1)  return lx >= WALL_R;
    if (tileY === sizeY-1)  return ly >= WALL_R;
    return false;
  }
  if (tileType === TILE.RIGHT) {
    return (lx < W && ly < W) ||            // TL corner
           (lx < W && ly >= WALL_R) ||       // BL corner
           (lx >= WALL_R);                   // Right wall
  }
  if (tileType === TILE.BOTTOM) {
    return (lx < W && ly < W) ||            // TL corner
           (lx >= WALL_R && ly < W) ||       // TR corner
           (ly >= WALL_R);                   // Bottom wall
  }
  if (tileType === TILE.LEFT) {
    return (lx < W) ||                      // Left wall
           (lx >= WALL_R && ly < W) ||       // TR corner
           (lx >= WALL_R && ly >= WALL_R);  // BR corner
  }
  if (tileType === TILE.TOP) {
    return (ly < W) ||                      // Top wall
           (lx < W && ly >= WALL_R) ||       // BL corner
           (lx >= WALL_R && ly >= WALL_R);  // BR corner
  }
  if (tileType === TILE.HORIZ) {
    return (ly < W) || (ly >= WALL_R);     // Top + Bottom walls
  }
  if (tileType === TILE.VERT) {
    return (lx < W) || (lx >= WALL_R);     // Left + Right walls
  }
  if (tileType === TILE.TL) {
    return (lx < W) ||                     // Left wall
           (ly < W) ||                     // Top wall
           (lx >= WALL_R && ly >= WALL_R); // BR corner
  }
  if (tileType === TILE.TR) {
    return (lx >= WALL_R) ||              // Right wall
           (ly < W) ||                    // Top wall
           (lx < W && ly >= WALL_R);     // BL corner
  }
  if (tileType === TILE.BL) {
    return (lx < W) ||                    // Left wall
           (ly >= WALL_R) ||              // Bottom wall
           (lx >= WALL_R && ly < W);     // TR corner
  }
  if (tileType === TILE.BR) {
    return (lx >= WALL_R) ||             // Right wall
           (ly >= WALL_R) ||             // Bottom wall
           (lx < W && ly < W);          // TL corner
  }
  if (tileType === TILE.OPEN) {
    return (lx < W && ly < W) ||            // TL corner
           (lx >= WALL_R && ly < W) ||       // TR corner
           (lx < W && ly >= WALL_R) ||       // BL corner
           (lx >= WALL_R && ly >= WALL_R);  // BR corner
  }
  return false;
}

/**
 * Build the pixel-level collision map.
 * Returns a Uint8Array of length (sizeX*TILE_SIZE) × (sizeY*TILE_SIZE),
 * indexed as [x + y * mapPixelWidth], where 1 = wall.
 */
export function buildCollisionMap(matrix: number[][], sizeX: number, sizeY: number): Uint8Array {
  const mapW = sizeX * TILE_SIZE;
  const mapH = sizeY * TILE_SIZE;
  const data = new Uint8Array(mapW * mapH);

  for (let ty = 0; ty < sizeY; ty++) {
    for (let tx = 0; tx < sizeX; tx++) {
      const tileType = matrix[tx][ty];
      for (let ly = 0; ly < TILE_SIZE; ly++) {
        for (let lx = 0; lx < TILE_SIZE; lx++) {
          if (isWallPixel(tileType, tx, ty, sizeX, sizeY, lx, ly)) {
            const px = tx * TILE_SIZE + lx;
            const py = ty * TILE_SIZE + ly;
            data[px + py * mapW] = 1;
          }
        }
      }
    }
  }
  return data;
}

/**
 * Collision lookup helper — out-of-bounds is treated as a wall.
 */
export function collision(data: Uint8Array, mapW: number, mapH: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mapW || y >= mapH) return true;
  return data[x + y * mapW] === 1;
}
