/**
 * PacManX — Canvas renderer
 *
 * Tile rendering is ported directly from VB.NET MapDraw():
 *   tile 0 (EMPTY):  imgMapWall   rotated per edge (0°/90°/180°/270°)
 *   tile 1 (RIGHT):  imgMapT      +90°
 *   tile 2 (BOTTOM): imgMapT      +180°
 *   tile 3 (LEFT):   imgMapT      +270°
 *   tile 4 (TOP):    imgMapT      +0°
 *   tile 5 (HORIZ):  imgMapStraight +90°
 *   tile 6 (VERT):   imgMapStraight +0°
 *   tile 7 (TL):     imgMapCorner  +0°
 *   tile 8 (TR):     imgMapCorner  +90°
 *   tile 9 (BL):     imgMapCorner  +270°
 *   tile 10 (BR):    imgMapCorner  +180°
 *   tile 11 (OPEN):  imgMapOpen    +0°
 *
 * Rotation is clockwise, matching VB.NET RotateFlipType.Rotate90FlipNone etc.
 */

import { TILE_SIZE, WALL_SIZE, PLAYER_SIZE, TILE } from './constants';
import type { Game } from './game';

const TS = TILE_SIZE; // 42

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

type ImageCache = Map<string, HTMLImageElement>;

function loadImage(name: string, ext = 'gif'): Promise<[string, HTMLImageElement]> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve([name, img]);
    img.onerror = () => resolve([name, img]); // missing = empty; don't block
    img.src = `${import.meta.env.BASE_URL}${name}.${ext}`;
  });
}

function allImageNames(): string[] {
  const names: string[] = [];

  // Map tiles
  names.push('imgMapWall', 'imgMapT', 'imgMapStraight', 'imgMapCorner', 'imgMapOpen', 'imgDot');

  // Pac-man frames 0-32 (alive 0-9, dead 0-32 overlap), phase frames 0-9
  for (let i = 0; i <= 32; i++) names.push(`imgPacMan${i}`);
  for (let i = 0; i <= 9; i++) names.push(`imgPacManPhase${i}`);

  // Ghost sprites — colored, blue, lightblue (frames 0-7); eyes (no frame)
  const colors = ['Green', 'Orange', 'Red', 'Blue', 'LightBlue'];
  const dirs = ['Right', 'Down', 'Left', 'Up'];
  for (const color of colors) {
    for (const dir of dirs) {
      for (let f = 0; f <= 7; f++) names.push(`imgGhost${color}${dir}${f}`);
    }
  }
  for (const dir of dirs) names.push(`imgGhostEyes${dir}`);

  return names;
}

// ---------------------------------------------------------------------------
// Tile rotation table  (degrees CW, from VB.NET RotateFlipType values)
// EMPTY border tiles are handled separately in buildMapCanvas.
// ---------------------------------------------------------------------------

// [image key, clockwise degrees]
const TILE_RENDER: Partial<Record<number, [string, number]>> = {
  [TILE.RIGHT]:  ['imgMapT',        90],
  [TILE.BOTTOM]: ['imgMapT',       180],
  [TILE.LEFT]:   ['imgMapT',       270],
  [TILE.TOP]:    ['imgMapT',         0],
  [TILE.HORIZ]:  ['imgMapStraight', 90],
  [TILE.VERT]:   ['imgMapStraight',  0],
  [TILE.TL]:     ['imgMapCorner',    0],
  [TILE.TR]:     ['imgMapCorner',   90],
  [TILE.BL]:     ['imgMapCorner',  270],
  [TILE.BR]:     ['imgMapCorner',  180],
  [TILE.OPEN]:   ['imgMapOpen',      0],
};

// ---------------------------------------------------------------------------
// Canvas drawing helpers
// ---------------------------------------------------------------------------

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawRotated(
  ctx: Ctx2D,
  img: HTMLImageElement,
  x: number, y: number,
  w: number, h: number,
  deg: number,
): void {
  if (deg === 0) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private images: ImageCache = new Map();
  private mapOffscreen: OffscreenCanvas | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Pre-load all game images. Resolves when complete (errors are non-fatal). */
  async load(): Promise<void> {
    const names = allImageNames();
    const results = await Promise.allSettled(names.map(n => loadImage(n)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [name, img] = r.value;
        this.images.set(name, img);
      }
    }
  }

  private img(name: string): HTMLImageElement | undefined {
    return this.images.get(name);
  }

  // ---------------------------------------------------------------------------
  // Map pre-rendering — call once per level, after generateMap()
  // ---------------------------------------------------------------------------

  buildMapCanvas(matrix: number[][], sizeX: number, sizeY: number): void {
    const mapW = sizeX * TS;
    const mapH = sizeY * TS;
    this.mapOffscreen = new OffscreenCanvas(mapW, mapH);
    const mctx = this.mapOffscreen.getContext('2d')!;

    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, mapW, mapH);

    for (let ty = 0; ty < sizeY; ty++) {
      for (let tx = 0; tx < sizeX; tx++) {
        const t = matrix[tx][ty];
        const px = tx * TS;
        const py = ty * TS;

        if (t === TILE.EMPTY) {
          // Interior EMPTY tiles are fully passable — leave black.
          // Border EMPTY tiles are the surrounding wall.
          let imgName: string | null = null;
          let deg = 0;
          if      (tx === 0)        { imgName = 'imgMapWall'; deg = 270; }
          else if (ty === 0)        { imgName = 'imgMapWall'; deg =   0; }
          else if (tx === sizeX-1)  { imgName = 'imgMapWall'; deg =  90; }
          else if (ty === sizeY-1)  { imgName = 'imgMapWall'; deg = 180; }

          if (imgName) {
            const src = this.img(imgName);
            if (src) drawRotated(mctx, src, px, py, TS, TS, deg);
          }
        } else {
          const entry = TILE_RENDER[t];
          if (entry) {
            const [imgName, deg] = entry;
            const src = this.img(imgName);
            if (src) drawRotated(mctx, src, px, py, TS, TS, deg);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Per-frame draw — called from game loop
  // ---------------------------------------------------------------------------

  draw(game: Game): void {
    const { sizeX, sizeY } = game;
    const mapW = sizeX * TS;
    const mapH = sizeY * TS;
    const totalH = mapH + 2 * TS; // map + 2 HUD rows

    // Resize canvas when map size changes (level transition)
    if (this.canvas.width !== mapW || this.canvas.height !== totalH) {
      this.canvas.width  = mapW;
      this.canvas.height = totalH;
    }

    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mapW, totalH);

    // Static map (pre-rendered offscreen)
    if (this.mapOffscreen) ctx.drawImage(this.mapOffscreen, 0, 0);

    this.drawDots(game);
    this.drawGhosts(game);
    this.drawPlayer(game);
    this.drawHUD(game, mapW, mapH);

    const overlay = game.overlayText;
    if (overlay) this.drawOverlay(ctx, overlay, mapW, mapH);
  }

  // ---------------------------------------------------------------------------
  // Dots
  // ---------------------------------------------------------------------------

  private drawDots(game: Game): void {
    const ctx = this.ctx;
    const dotImg = this.img('imgDot');
    // VB.NET: dot at (i*42 + (42-7)\2, j*42 + (42-7)\2), size 7×7
    const dotOffset = Math.floor((TS - WALL_SIZE) / 2); // = 17

    for (let ty = 0; ty < game.sizeY; ty++) {
      for (let tx = 0; tx < game.sizeX; tx++) {
        if (!game.dots[tx]?.[ty]) continue;
        const px = tx * TS + dotOffset;
        const py = ty * TS + dotOffset;
        if (dotImg) {
          ctx.drawImage(dotImg, px, py, WALL_SIZE, WALL_SIZE);
        } else {
          ctx.fillStyle = '#fff';
          ctx.fillRect(px, py, WALL_SIZE, WALL_SIZE);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Ghosts
  // ---------------------------------------------------------------------------

  private drawGhosts(game: Game): void {
    const ctx = this.ctx;
    const GHOST_COLORS = ['#0f0', '#f80', '#f00'];

    for (let i = 0; i < game.ghostCount; i++) {
      const key = game.ghostImageKey(i);
      const img = this.img(key);
      if (img) {
        ctx.drawImage(img, game.gx[i], game.gy[i], PLAYER_SIZE, PLAYER_SIZE);
      } else {
        // Fallback: colored square
        ctx.fillStyle = GHOST_COLORS[i % 3];
        ctx.fillRect(game.gx[i], game.gy[i], PLAYER_SIZE, PLAYER_SIZE);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  private drawPlayer(game: Game): void {
    // Invisible during blank phase after death animation completes
    if (!game.pAlive && game.pDeadAnimCycle > 125) return;

    const ctx = this.ctx;
    const key = game.playerImageKey;
    const deg = game.playerRotation;
    const img = this.img(key);

    if (img) {
      drawRotated(ctx, img, game.px, game.py, PLAYER_SIZE, PLAYER_SIZE, deg);
    } else {
      ctx.fillStyle = '#ff0';
      ctx.fillRect(game.px, game.py, PLAYER_SIZE, PLAYER_SIZE);
    }
  }

  // ---------------------------------------------------------------------------
  // HUD  (2 rows below the map, matching original VB.NET layout)
  //
  //  Row 1 (y = mapH):        SCORE    <value>
  //  Row 2 (y = mapH + TS):   [pac] x N    ... [ghost?] [phase?]
  // ---------------------------------------------------------------------------

  private drawHUD(game: Game, mapW: number, mapH: number): void {
    const ctx = this.ctx;
    const scoreRowY = mapH;
    const livesRowY = mapH + TS;

    // --- Score row ---
    ctx.fillStyle = '#f5f5f5';
    ctx.font = `bold ${PLAYER_SIZE}px "Courier New", monospace`;
    ctx.textBaseline = 'middle';
    const midY = scoreRowY + TS / 2;

    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 0, midY);

    ctx.textAlign = 'right';
    ctx.fillText(game.currentScore().toString(), mapW, midY);

    // --- Lives row ---
    const iconY = livesRowY + WALL_SIZE;

    // Pac-man life icon (imgPacMan5 = half-open, facing right)
    const livesIcon = this.img('imgPacMan5');
    if (livesIcon) {
      ctx.drawImage(livesIcon, WALL_SIZE, iconY, PLAYER_SIZE, PLAYER_SIZE);
    }

    ctx.textAlign = 'left';
    ctx.font = `bold ${PLAYER_SIZE}px "Courier New", monospace`;
    ctx.fillStyle = '#f5f5f5';
    ctx.textBaseline = 'middle';
    ctx.fillText(`x ${game.pLives - 1}`, TS, livesRowY + TS / 2);

    // Ghost powerup icon — shown when charged (ready) or active
    // Position: second-to-last tile column (matches VB.NET sizeX-2)
    const ghostIconX = (game.sizeX - 2) * TS + WALL_SIZE;
    const ghostIcon = this.img('imgGhostBlueRight0');
    if (ghostIcon && (game.pGhostReady || game.pGhostActive)) {
      ctx.drawImage(ghostIcon, ghostIconX, iconY, PLAYER_SIZE, PLAYER_SIZE);
    }

    // Phase powerup icon — always shown; dimmed when on cooldown
    // Position: last tile column (matches VB.NET sizeX-1)
    const phaseIconX = (game.sizeX - 1) * TS + WALL_SIZE;
    const phaseIcon = this.img('imgPacManPhase5');
    if (phaseIcon) {
      ctx.globalAlpha = game.pPhaseReady ? 1.0 : 0.3;
      ctx.drawImage(phaseIcon, phaseIconX, iconY, PLAYER_SIZE, PLAYER_SIZE);
      ctx.globalAlpha = 1.0;
    }
  }

  // ---------------------------------------------------------------------------
  // Overlay text (READY?, START!, PAUSED, END? Y/N, GAME OVER)
  // ---------------------------------------------------------------------------

  private drawOverlay(ctx: CanvasRenderingContext2D, text: string, mapW: number, mapH: number): void {
    const fontSize = PLAYER_SIZE;
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(text);
    const tw = metrics.width + 20;
    const th = fontSize + 14;
    const bx = mapW / 2 - tw / 2;
    const by = mapH / 2 - th / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(bx, by, tw, th);

    const color =
      text === 'GAME OVER' ? '#f44' :
      text === 'START!'    ? '#ffe44d' :
      '#f5f5f5';
    ctx.fillStyle = color;
    ctx.fillText(text, mapW / 2, mapH / 2);
  }
}
