/**
 * PacManX — core game logic
 * Ported from VB.NET (frmGame.vb) to TypeScript.
 *
 * All variable names and logic map directly to the original; the comments
 * reference the original sub/method names for easy cross-referencing.
 */

import {
  TILE_SIZE, WALL_SIZE, PLAYER_SIZE, MOVE_SPEED,
  SCORE_PER_DOT, GHOST_CHARGEUP_GOAL,
  TILE, DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_UP,
} from './constants';
import { generateMap, buildCollisionMap, collision } from './mapgen';
import { SoundManager } from './audio';
import { Renderer } from './renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HiScore {
  player: string;
  score: number;
  difficulty: string;
}

export type Screen =
  | 'main' | 'gamemodes' | 'quickmode' | 'hiscores'
  | 'instructions' | 'hiscore_entry'
  | 'arcade_game' | 'quick_game';

export type GameEventListener = (event: 'screen_change', screen: Screen) => void;

// ---------------------------------------------------------------------------
// Constants derived from original timer intervals
// ---------------------------------------------------------------------------
const TIMER_20  = 20;   // tmr20  — player + easy ghost
const TIMER_18  = 18;   // tmr18  — medium ghost
const TIMER_16  = 16;   // tmr16  — hard ghost
const TIMER_500 = 500;  // tmr500 — slow (start count, powerup ticks)
const TIMER_40  = 40;   // tmr40  — powerup ghost movement

// tmr500 ticks per second = 1000/500 = 2
const T500_PER_SEC = 1000 / TIMER_500;

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export class Game {
  // External dependencies
  readonly sound: SoundManager;
  readonly renderer: Renderer;

  // Screen / menu state
  private _screen: Screen = 'main';
  private listeners: GameEventListener[] = [];

  // Hi scores (backed by localStorage)
  hiScores: HiScore[];

  // Game mode settings
  private gameMode: 0 | 1 = 0;  // 0=Arcade, 1=Quick
  private difficulty = 0;
  private ghostSpeed = 10;       // 10=Easy, 9=Medium, 8=Hard
  private ghostDivisor = 33;     // ghost count = (mapX*mapY) / divisor
  private diffLives = 4;
  private newLifeDivisor = 50;   // dots per new life (0 = never)
  private minMapSize = 6;
  private maxMapSize = 10;

  // Map
  sizeX = 6;
  sizeY = 6;
  matrix: number[][] = [];
  collisionData: Uint8Array = new Uint8Array(0);
  mapW = 0;
  mapH = 0;

  // Dots  — dots[x][y] = true means the dot is still present
  dots: boolean[][] = [];
  dotCount = 0;       // remaining dots this level
  totalDots = 0;      // total dots at level start

  // Player
  px = 0;   // left-edge pixel x
  py = 0;   // left-edge pixel y
  pdx = 0;  pdy = 0;       // current velocity
  pdxKey = 0; pdyKey = 0;  // buffered key velocity
  pDir = DIR_RIGHT;
  pAlive = true;
  pLives = 4;
  pDotCount = 0;            // total dots eaten (= score / SCORE_PER_DOT)
  pNewLifeCountdown = 0;
  pNewLifeDivisor = 0;
  pCollision = false;
  pCollisionKey = false;
  pCyclesSinceKey = 0;
  pAnimCycle = 0;
  pDeadAnimCycle = 0;

  // Phase powerup (X key)
  pPhaseActive = false;
  pPhaseReady = true;
  pPhaseCycles = 0;
  pPhaseCooldown = 0;  // ticks at 500ms rate until ready
  pPhaseAnim = false;
  pPhaseAnimCycle = 0;

  // Ghost powerup (Space)
  pGhostActive = false;
  pGhostReady = false;
  pGhostCycles = 0;    // ticks at 500ms rate
  pGhostChargeup = 0;

  // Ghosts
  ghostCount = 0;
  gx: number[] = [];
  gy: number[] = [];
  gdx: number[] = [];
  gdy: number[] = [];
  gDir: number[] = [];
  gDirPre: number[] = [];
  gCollision: boolean[] = [];
  gEaten: boolean[] = [];
  gEatenCooldown: number[] = [];
  gPlayerDist: number[] = [];
  gAnimCycle = 0;

  // Game flow
  paused = false;
  gameStarted = false;
  startCycle = 0;
  showExit = false;
  gameOver = false;

  // Dot sound cycling (matches VB.NET bolDotLooping / intLoopCyclesSinceDot)
  dotLooping = false;
  loopCyclesSinceDot = 0;

  // Accumulated timer state (for requestAnimationFrame-based multi-rate loop)
  private t20 = 0;
  private t18 = 0;
  private t16 = 0;
  private t500 = 0;
  private t40 = 0;
  private lastTimestamp = 0;
  private rafId = 0;

  // Quick mode overrides
  quickSizeX = 6;
  quickSizeY = 6;

  constructor(sound: SoundManager, renderer: Renderer) {
    this.sound = sound;
    this.renderer = renderer;
    this.hiScores = this.loadHiScores();
  }

  // ---------------------------------------------------------------------------
  // Screen / event helpers
  // ---------------------------------------------------------------------------

  get screen(): Screen { return this._screen; }

  private setScreen(s: Screen): void {
    this._screen = s;
    for (const l of this.listeners) l('screen_change', s);
  }

  on(listener: GameEventListener): void {
    this.listeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Hi Score persistence (localStorage replaces hiscores.txt)
  // ---------------------------------------------------------------------------

  private loadHiScores(): HiScore[] {
    try {
      const raw = localStorage.getItem('pacmanx_hiscores');
      if (raw) return JSON.parse(raw) as HiScore[];
    } catch { /* ignore */ }
    return Array.from({ length: 10 }, () => ({
      player: 'AAA',
      score: 1000,
      difficulty: 'Easy',
    }));
  }

  saveHiScores(): void {
    try {
      localStorage.setItem('pacmanx_hiscores', JSON.stringify(this.hiScores));
    } catch { /* ignore — private browsing or quota exceeded */ }
  }

  /** Insert a new score if it qualifies. Returns true if inserted. */
  submitHiScore(initials: string, score: number, difficulty: string): boolean {
    let inserted = false;
    const entry: HiScore = { player: initials.toUpperCase(), score, difficulty };
    for (let i = 0; i < 10; i++) {
      if (score > this.hiScores[i].score && !inserted) {
        this.hiScores.splice(i, 0, entry);
        this.hiScores.length = 10;
        inserted = true;
        break;
      }
    }
    if (inserted) this.saveHiScores();
    return inserted;
  }

  currentScore(): number {
    return this.pDotCount * SCORE_PER_DOT;
  }

  qualifiesForHiScore(): boolean {
    const s = this.currentScore();
    return this.hiScores.some(h => s > h.score);
  }

  // ---------------------------------------------------------------------------
  // Start / restart
  // ---------------------------------------------------------------------------

  startArcade(): void {
    this.gameMode = 0;
    this.difficulty = 0;
    this.ghostSpeed = 10;
    this.ghostDivisor = 33;
    this.diffLives = 4;
    this.newLifeDivisor = 50;
    this.minMapSize = 6;
    this.maxMapSize = 10;
    this.sizeX = this.minMapSize;
    this.sizeY = this.minMapSize;
    this.initGame();
  }

  startQuick(cfg: {
    sizeX: number; sizeY: number;
    ghostSpeed: number; ghostDivisor: number;
    lives: number; newLifeDivisor: number;
  }): void {
    this.gameMode = 1;
    this.difficulty = -1; // quick mode has no difficulty tier
    this.ghostSpeed    = cfg.ghostSpeed;
    this.ghostDivisor  = cfg.ghostDivisor;
    this.diffLives     = cfg.lives;
    this.newLifeDivisor = cfg.newLifeDivisor;
    this.sizeX = cfg.sizeX;
    this.sizeY = cfg.sizeY;
    this.initGame();
  }

  private initGame(): void {
    this.setScreen(this.gameMode === 0 ? 'arcade_game' : 'quick_game');
    this.buildStart();
    this.buildMap();
    this.buildGhosts();
    this.buildPlayer();
    this.buildDots();
    this.sound.stopAll();
    this.sound.play('audStart');
    this.renderer.buildMapCanvas(this.matrix, this.sizeX, this.sizeY);
    this.startTimers();
  }

  // ---------------------------------------------------------------------------
  // Build helpers (match VB.NET Build/ReBuild subs)
  // ---------------------------------------------------------------------------

  private buildStart(): void {  // StartBuild()
    this.startCycle = 0;
    this.paused = true;
    this.showExit = false;
    this.gameOver = false;
    this.gameStarted = true;
  }

  private buildMap(): void {   // MapInitialize()
    this.matrix = generateMap(this.sizeX, this.sizeY);
    this.mapW = this.sizeX * TILE_SIZE;
    this.mapH = this.sizeY * TILE_SIZE;
    this.collisionData = buildCollisionMap(this.matrix, this.sizeX, this.sizeY);
  }

  private buildGhosts(): void {  // GhostBuild()
    this.ghostCount = Math.floor((this.sizeX * this.sizeY) / this.ghostDivisor);
    this.gx = new Array(this.ghostCount);
    this.gy = new Array(this.ghostCount);
    this.gdx = new Array(this.ghostCount);
    this.gdy = new Array(this.ghostCount);
    this.gDir = new Array(this.ghostCount);
    this.gDirPre = new Array(this.ghostCount);
    this.gCollision = new Array(this.ghostCount).fill(false);
    this.gEaten = new Array(this.ghostCount).fill(false);
    this.gEatenCooldown = new Array(this.ghostCount).fill(0);
    this.gPlayerDist = new Array(this.ghostCount).fill(0);
    this.gAnimCycle = 0;

    for (let i = 0; i < this.ghostCount; i++) {
      const mod = i % 3;
      if (mod === 0) {       // Green — bottom-right corner, moving up
        this.gDir[i] = DIR_UP;
        this.gdx[i] = 0; this.gdy[i] = -MOVE_SPEED;
        this.gx[i] = WALL_SIZE + TILE_SIZE * (this.sizeX - 1);
        this.gy[i] = WALL_SIZE + TILE_SIZE * (this.sizeY - 1);
      } else if (mod === 1) { // Orange — top-right corner, moving left
        this.gDir[i] = DIR_LEFT;
        this.gdx[i] = -MOVE_SPEED; this.gdy[i] = 0;
        this.gx[i] = WALL_SIZE + TILE_SIZE * (this.sizeX - 1);
        this.gy[i] = WALL_SIZE;
      } else {                // Red — bottom-left corner, moving up
        this.gDir[i] = DIR_UP;
        this.gdx[i] = 0; this.gdy[i] = -MOVE_SPEED;
        this.gx[i] = WALL_SIZE;
        this.gy[i] = WALL_SIZE + TILE_SIZE * (this.sizeY - 1);
      }
      this.gDirPre[i] = this.gDir[i];
    }
  }

  private buildPlayer(): void {   // PlayerBuild()
    this.pAnimCycle = 0;
    this.pDeadAnimCycle = 0;
    this.pPhaseAnim = false;
    this.pPhaseAnimCycle = 0;
    this.pCyclesSinceKey = 0;
    this.pDir = DIR_RIGHT;
    this.pdx = 0; this.pdy = 0;
    this.pdxKey = 0; this.pdyKey = 0;
    this.pAlive = true;
    this.pCollision = false;
    this.pCollisionKey = false;
    this.pDotCount = 0;
    this.pLives = this.diffLives;
    this.pNewLifeDivisor = this.newLifeDivisor;
    this.pNewLifeCountdown = this.newLifeDivisor;
    this.pPhaseActive = false;
    this.pPhaseReady = true;
    this.pPhaseCycles = 0;
    this.pPhaseCooldown = 0;
    this.pGhostActive = false;
    this.pGhostReady = false;
    this.pGhostCycles = 0;
    this.pGhostChargeup = 0;
    this.px = WALL_SIZE;
    this.py = WALL_SIZE;
    this.updateGhostDistances();
  }

  private rebuildPlayer(): void {  // PlayerReBuild()
    this.pAnimCycle = 0;
    this.pDeadAnimCycle = 0;
    this.pPhaseAnim = false;
    this.pPhaseAnimCycle = 0;
    this.pCyclesSinceKey = 0;
    this.pDir = DIR_RIGHT;
    this.pdx = 0; this.pdy = 0;
    this.pdxKey = 0; this.pdyKey = 0;
    this.pAlive = true;
    this.pCollision = false;
    this.pCollisionKey = false;
    this.pPhaseActive = false;
    this.pPhaseReady = true;
    this.pPhaseCycles = 0;
    this.pPhaseCooldown = 0;
    this.pGhostActive = false;
    this.pGhostCycles = 0;
    this.px = WALL_SIZE;
    this.py = WALL_SIZE;
    this.updateGhostDistances();
  }

  private rebuildGhosts(): void {  // GhostReBuild()
    this.gAnimCycle = 0;
    for (let i = 0; i < this.ghostCount; i++) {
      const mod = i % 3;
      this.gCollision[i] = false;
      this.gEaten[i] = false;
      this.gEatenCooldown[i] = 0;
      if (mod === 0) {
        this.gDir[i] = DIR_UP; this.gdx[i] = 0; this.gdy[i] = -MOVE_SPEED;
        this.gx[i] = WALL_SIZE + TILE_SIZE * (this.sizeX - 1);
        this.gy[i] = WALL_SIZE + TILE_SIZE * (this.sizeY - 1);
      } else if (mod === 1) {
        this.gDir[i] = DIR_LEFT; this.gdx[i] = -MOVE_SPEED; this.gdy[i] = 0;
        this.gx[i] = WALL_SIZE + TILE_SIZE * (this.sizeX - 1);
        this.gy[i] = WALL_SIZE;
      } else {
        this.gDir[i] = DIR_UP; this.gdx[i] = 0; this.gdy[i] = -MOVE_SPEED;
        this.gx[i] = WALL_SIZE;
        this.gy[i] = WALL_SIZE + TILE_SIZE * (this.sizeY - 1);
      }
      this.gDirPre[i] = this.gDir[i];
    }
  }

  private buildDots(): void {   // DotBuild()
    this.dots = Array.from({ length: this.sizeX }, () => new Array(this.sizeY).fill(false));
    this.dotCount = 0;
    for (let y = 0; y < this.sizeY; y++) {
      for (let x = 0; x < this.sizeX; x++) {
        if (x === 0 && y === 0) continue; // player start — no dot here
        if (this.matrix[x][y] !== TILE.EMPTY) {
          this.dots[x][y] = true;
          this.dotCount++;
        }
      }
    }
    this.totalDots = this.dotCount;
  }

  // ---------------------------------------------------------------------------
  // Player dead / level complete
  // ---------------------------------------------------------------------------

  private onPlayerDead(): void {   // PlayerDead()
    this.startCycle = 0;
    this.paused = true;
    this.rebuildGhosts();
    this.rebuildPlayer();
  }

  private onLevelComplete(): void {  // PlayerLevel()
    if (this.gameMode === 0) {
      // Arcade mode: grow map, eventually bump difficulty
      if (this.difficulty < 3 && this.sizeX === this.maxMapSize) {
        this.difficulty++;
        if (this.difficulty === 1) {
          this.ghostSpeed = 9; this.ghostDivisor = 21;
          this.diffLives = 3; this.newLifeDivisor = 100;
          this.minMapSize = 8; this.maxMapSize = 12;
        } else if (this.difficulty === 2) {
          this.ghostSpeed = 8; this.ghostDivisor = 11;
          this.diffLives = 2; this.newLifeDivisor = 200;
          this.minMapSize = 10; this.maxMapSize = 15;
        } else if (this.difficulty === 3) {
          this.diffLives = 1; this.newLifeDivisor = 0;
        }
        this.sizeX = this.minMapSize;
        this.sizeY = this.minMapSize;
        this.pLives++;
        this.pNewLifeDivisor = this.newLifeDivisor;
        this.pNewLifeCountdown += this.newLifeDivisor;
        this.sound.seekAndPlay('audNewLife');
      } else if (this.sizeX < this.maxMapSize) {
        this.sizeX++;
        this.sizeY++;
      }

      // Rebuild everything for new level
      this.sound.stopAll();
      this.dotLooping = false;
      this.loopCyclesSinceDot = 0;
      this.buildStart();
      this.buildMap();
      this.buildGhosts();
      this.rebuildPlayer();
      this.buildDots();
      this.renderer.buildMapCanvas(this.matrix, this.sizeX, this.sizeY);
      this.sound.seekAndPlay('audLevel');
    } else {
      // Quick mode: just return to menu
      this.endGame();
      this.setScreen('main');
    }
  }

  private onGameOver(): void {
    if (this.qualifiesForHiScore()) {
      this.setScreen('hiscore_entry');
    } else {
      this.setScreen('main');
    }
  }

  endGame(): void {
    this.stopTimers();
    this.gameStarted = false;
    this.sound.stopAll();
  }

  // ---------------------------------------------------------------------------
  // Timer loop
  // ---------------------------------------------------------------------------

  private startTimers(): void {
    this.t20 = 0; this.t18 = 0; this.t16 = 0; this.t500 = 0; this.t40 = 0;
    this.lastTimestamp = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private stopTimers(): void {
    cancelAnimationFrame(this.rafId);
  }

  private loop = (ts: number): void => {
    if (this.lastTimestamp === 0) this.lastTimestamp = ts;
    const dt = Math.min(ts - this.lastTimestamp, 100); // clamp to avoid spiral-of-death
    this.lastTimestamp = ts;

    this.t20  += dt; this.t18  += dt; this.t16  += dt;
    this.t500 += dt; this.t40  += dt;

    while (this.t20 >= TIMER_20) {
      this.tick20();
      this.t20 -= TIMER_20;
    }
    while (this.t18 >= TIMER_18) {
      this.tick18();
      this.t18 -= TIMER_18;
    }
    while (this.t16 >= TIMER_16) {
      this.tick16();
      this.t16 -= TIMER_16;
    }
    while (this.t500 >= TIMER_500) {
      this.tick500();
      this.t500 -= TIMER_500;
    }
    while (this.t40 >= TIMER_40) {
      this.tick40();
      this.t40 -= TIMER_40;
    }

    this.renderer.draw(this);
    if (this.gameStarted) this.rafId = requestAnimationFrame(this.loop);
  };

  // ---------------------------------------------------------------------------
  // Tick methods (match original timer handlers)
  // ---------------------------------------------------------------------------

  private tick20(): void {   // tmr20_Tick
    if (!this.paused) {
      if (this.pAlive) {
        if (!this.pPhaseActive) {
          this.playerCollisionKey();
          this.playerCollision();

          if (this.ghostSpeed === 10) {
            if (!this.pGhostActive) {
              this.ghostMapCollision();
              this.ghostAnim();
              // Looping ghost-speed sound
              if (this.sound.isNearEnd('audGhostSpeed1', 0.035)) this.sound.seekAndPlay('audGhostSpeed1');
              else this.sound.play('audGhostSpeed1');
            }
            this.playerGhostCollision();
          }
        } else {
          this.pCollision = false; // phase through walls
        }

        this.playerAnim();
        this.playerDotCollision();

        if (this.dotCount === 0) {
          this.onLevelComplete();
          return;
        }
      } else {
        this.playerDeadAnim();
      }

      // Dot sound loop
      if (this.dotLooping) {
        if (this.sound.isNearEnd('audDot1')) {
          this.sound.stop('audDot1');
          this.sound.seekAndPlay('audDot2');
          this.loopCyclesSinceDot++;
        } else if (this.sound.isNearEnd('audDot2')) {
          this.sound.stop('audDot2');
          this.sound.seekAndPlay('audDot1');
          this.loopCyclesSinceDot++;
        }
        if (this.loopCyclesSinceDot > 5) this.dotLooping = false;
      }

      // Phase powerup position counter
      if (this.pPhaseActive) {
        this.pPhaseCycles += MOVE_SPEED;
        if (this.pPhaseCycles >= WALL_SIZE * 2) {
          this.pPhaseCycles = 0;
          this.pPhaseActive = false;
        }
      }
    }
  }

  private tick18(): void {   // tmr18_Tick
    if (!this.paused && this.pAlive && !this.pPhaseActive && this.ghostSpeed === 9) {
      if (!this.pGhostActive) {
        this.ghostMapCollision();
        this.ghostAnim();
        if (this.sound.isNearEnd('audGhostSpeed2', 0.035)) this.sound.seekAndPlay('audGhostSpeed2');
        else this.sound.play('audGhostSpeed2');
      }
      this.playerGhostCollision();
    }
  }

  private tick16(): void {   // tmr16_Tick
    if (!this.paused && this.pAlive && !this.pPhaseActive && this.ghostSpeed === 8) {
      if (!this.pGhostActive) {
        this.ghostMapCollision();
        this.ghostAnim();
        if (this.sound.isNearEnd('audGhostSpeed3', 0.085)) this.sound.seekAndPlay('audGhostSpeed3');
        else this.sound.play('audGhostSpeed3');
      }
      this.playerGhostCollision();
    }
  }

  private tick500(): void {  // tmr500_Tick
    // Start countdown
    if (this.startCycle < 6 * T500_PER_SEC) {
      if (this.startCycle >= 4 * T500_PER_SEC) {
        this.paused = false; // "START!" — unpause
      }
      this.startCycle++;
    }

    if (!this.paused && this.pAlive) {
      // Phase powerup cooldown
      if (this.pPhaseCooldown > 0) {
        this.pPhaseCooldown--;
      } else {
        this.pPhaseReady = true;
      }

      // Ghost powerup duration
      if (this.pGhostActive) {
        this.pGhostCycles++;
        if (this.pGhostCycles >= 10 * T500_PER_SEC) {
          this.pGhostCycles = 0;
          this.pGhostActive = false;
        }
      }

      // Ghost eaten cooldown
      for (let i = 0; i < this.ghostCount; i++) {
        if (this.gEaten[i]) {
          this.gEatenCooldown[i]--;
          if (this.gEatenCooldown[i] <= 0) this.gEaten[i] = false;
        }
      }
    }
  }

  private tick40(): void {   // tmr40_Tick
    if (!this.paused && this.pAlive && !this.pPhaseActive && this.pGhostActive) {
      this.ghostMapCollision();
      this.ghostAnim();
      if (this.sound.isNearEnd('audPowerupGhostActive', 0.025)) this.sound.seekAndPlay('audPowerupGhostActive');
      else this.sound.play('audPowerupGhostActive');
    }
  }

  // ---------------------------------------------------------------------------
  // Ghost AI  (GhostMapCollision + GhostAnim)
  // ---------------------------------------------------------------------------

  private ghostMapCollision(): void {
    for (let k = 0; k < this.ghostCount; k++) {
      const atTileBoundary =
        ((this.gDir[k] === DIR_RIGHT || this.gDir[k] === DIR_LEFT) &&
          (this.gx[k] % TILE_SIZE) === WALL_SIZE) ||
        ((this.gDir[k] === DIR_DOWN  || this.gDir[k] === DIR_UP) &&
          (this.gy[k] % TILE_SIZE) === WALL_SIZE);

      if (atTileBoundary) {
        this.gCollision[k] = true;
        this.gDirPre[k] = this.gDir[k];

        // Decide new direction
        const rnd = Math.random();
        const mod = k % 3;

        // Red ghosts (mod=2) have a 25% chance to pathfind toward player
        const usePathfind = this.pGhostActive
          ? true                     // all ghosts flee during ghost powerup
          : (mod === 2 && rnd < 0.25);

        if (this.pGhostActive) {
          // Flee from player
          this.chooseGhostDirection(k, false /*flee*/);
        } else if (usePathfind) {
          // Chase player
          this.chooseGhostDirection(k, true /*chase*/);
        } else {
          // Random turn (no U-turn)
          this.randomTurnGhost(k);
        }
      }

      // Wall-collision resolution: sample non-U-turn directions without replacement.
      if (this.gCollision[k]) {
        if (!this.ghostWouldCollide(k)) {
          this.gCollision[k] = false;
        } else {
          const remaining = [...this.noUTurnChoices(this.gDirPre[k])];
          while (remaining.length > 0) {
            const idx = Math.floor(Math.random() * remaining.length);
            this.applyGhostDir(k, remaining[idx]);
            remaining.splice(idx, 1);
            if (!this.ghostWouldCollide(k)) { this.gCollision[k] = false; break; }
          }
        }
      }
    }
  }

  private ghostWouldCollide(k: number): boolean {
    const dx = this.gdx[k];
    const dy = this.gdy[k];
    const gl = this.gx[k];
    const gt = this.gy[k];
    const gr = gl + PLAYER_SIZE - 1;
    const gb = gt + PLAYER_SIZE - 1;
    const cd = this.collisionData;
    const mw = this.mapW; const mh = this.mapH;

    if (dx > 0) return collision(cd, mw, mh, gr + dx, gt);
    if (dy > 0) return collision(cd, mw, mh, gl, gb + dy);
    if (dx < 0) return collision(cd, mw, mh, gl + dx, gt);
    if (dy < 0) return collision(cd, mw, mh, gl, gt + dy);
    return false;
  }

  private dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  }

  private ghostCenterX(k: number): number { return this.gx[k] + PLAYER_SIZE / 2; }
  private ghostCenterY(k: number): number { return this.gy[k] + PLAYER_SIZE / 2; }
  private playerCenterX(): number { return this.px + PLAYER_SIZE / 2; }
  private playerCenterY(): number { return this.py + PLAYER_SIZE / 2; }

  /** Choose direction that brings ghost closer (chase=true) or farther (chase=false) from player. */
  private chooseGhostDirection(k: number, chase: boolean): void {
    const gl = this.gx[k]; const gt = this.gy[k];
    const gr = gl + PLAYER_SIZE - 1; const gb = gt + PLAYER_SIZE - 1;
    const cx = this.ghostCenterX(k); const cy = this.ghostCenterY(k);
    const px = this.playerCenterX(); const py = this.playerCenterY();
    const cd = this.collisionData; const mw = this.mapW; const mh = this.mapH;
    const ms = MOVE_SPEED;

    let bestDist = this.dist(cx, cy, px, py);
    let bestDir = this.gDir[k];
    let bestDx = this.gdx[k]; let bestDy = this.gdy[k];
    let found = false;

    // Try all 4 directions in random starting order
    const dirs = [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_UP];
    const start = Math.floor(Math.random() * 4);
    for (let d = start; d < start + 4; d++) {
      const dir = dirs[d % 4] as 0|1|2|3;
      let ndx = 0, ndy = 0, ncx = 0, ncy = 0;
      let ok = false;
      if (dir === DIR_RIGHT) { ndx =  ms; ndy = 0;   ncx = cx + TILE_SIZE; ncy = cy;           ok = !collision(cd, mw, mh, gr + ms, gt); }
      if (dir === DIR_DOWN)  { ndx = 0;  ndy =  ms;  ncx = cx;           ncy = cy + TILE_SIZE; ok = !collision(cd, mw, mh, gl, gb + ms); }
      if (dir === DIR_LEFT)  { ndx = -ms; ndy = 0;   ncx = cx - TILE_SIZE; ncy = cy;            ok = !collision(cd, mw, mh, gl - ms, gt); }
      if (dir === DIR_UP)    { ndx = 0;  ndy = -ms;  ncx = cx;           ncy = cy - TILE_SIZE; ok = !collision(cd, mw, mh, gl, gt - ms); }

      if (!ok) continue;

      const d2 = this.dist(ncx, ncy, px, py);
      const better = chase ? (d2 < bestDist) : (d2 > bestDist);
      if (better || !found) {
        bestDist = d2; bestDir = dir; bestDx = ndx; bestDy = ndy;
        if (better) found = true;
      }
    }

    this.gDir[k] = bestDir;
    this.gdx[k] = bestDx;
    this.gdy[k] = bestDy;
    if (found) this.gCollision[k] = false;
  }

  /** Random turn, no U-turn (matches original random 0..2 table). */
  private randomTurnGhost(k: number): void {
    const dir = this.gDir[k];
    const choices = this.noUTurnChoices(dir);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    this.applyGhostDir(k, pick);
  }

  private noUTurnChoices(dir: number): number[] {
    // Returns the 3 non-reversing directions relative to current dir
    if (dir === DIR_RIGHT) return [DIR_UP, DIR_DOWN, DIR_RIGHT];
    if (dir === DIR_DOWN)  return [DIR_RIGHT, DIR_LEFT, DIR_DOWN];
    if (dir === DIR_LEFT)  return [DIR_DOWN, DIR_UP, DIR_LEFT];
    /* UP */               return [DIR_LEFT, DIR_RIGHT, DIR_UP];
  }

  private applyGhostDir(k: number, dir: number): void {
    const ms = MOVE_SPEED;
    this.gDir[k] = dir;
    if (dir === DIR_RIGHT) { this.gdx[k] =  ms; this.gdy[k] = 0; }
    if (dir === DIR_DOWN)  { this.gdx[k] = 0;   this.gdy[k] =  ms; }
    if (dir === DIR_LEFT)  { this.gdx[k] = -ms; this.gdy[k] = 0; }
    if (dir === DIR_UP)    { this.gdx[k] = 0;   this.gdy[k] = -ms; }
  }

  private ghostAnim(): void {   // GhostAnim()
    for (let i = 0; i < this.ghostCount; i++) {
      this.gx[i] += this.gdx[i];
      this.gy[i] += this.gdy[i];
    }
    this.gAnimCycle = (this.gAnimCycle + MOVE_SPEED) % 8;

    // Ghost-eaten cooldown sound
    for (let i = 0; i < this.ghostCount; i++) {
      if (this.gEaten[i]) {
        if (this.sound.isNearEnd('audGhostEatenCooldown', 0.01)) this.sound.seekAndPlay('audGhostEatenCooldown');
        else this.sound.play('audGhostEatenCooldown');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Player collision & movement
  // ---------------------------------------------------------------------------

  private playerCollisionKey(): void {  // PlayerCollisionKey()
    if (this.pCyclesSinceKey < TILE_SIZE / 2 && this.pCollisionKey) {
      let blocked = false;
      const cd = this.collisionData; const mw = this.mapW; const mh = this.mapH;

      if (this.pdxKey > 0) {
        for (let y = this.py; y < this.py + PLAYER_SIZE && !blocked; y++)
          blocked = collision(cd, mw, mh, this.px + PLAYER_SIZE - 1 + this.pdxKey, y);
      } else if (this.pdyKey > 0) {
        for (let x = this.px; x < this.px + PLAYER_SIZE && !blocked; x++)
          blocked = collision(cd, mw, mh, x, this.py + PLAYER_SIZE - 1 + this.pdyKey);
      } else if (this.pdxKey < 0) {
        for (let y = this.py; y < this.py + PLAYER_SIZE && !blocked; y++)
          blocked = collision(cd, mw, mh, this.px + this.pdxKey, y);
      } else if (this.pdyKey < 0) {
        for (let x = this.px; x < this.px + PLAYER_SIZE && !blocked; x++)
          blocked = collision(cd, mw, mh, x, this.py + this.pdyKey);
      }

      if (!blocked) {
        this.pdx = this.pdxKey;
        this.pdy = this.pdyKey;
        this.pCollisionKey = false;
      }
    }

    this.pCyclesSinceKey++;
    if (this.pCyclesSinceKey > 10000) this.pCyclesSinceKey = 5000;
  }

  private playerCollision(): void {  // PlayerCollision()
    this.pCollision = false;
    const cd = this.collisionData; const mw = this.mapW; const mh = this.mapH;

    if (this.pdx > 0) {
      for (let y = this.py; y < this.py + PLAYER_SIZE && !this.pCollision; y++)
        this.pCollision = collision(cd, mw, mh, this.px + PLAYER_SIZE - 1 + this.pdx, y);
    } else if (this.pdy > 0) {
      for (let x = this.px; x < this.px + PLAYER_SIZE && !this.pCollision; x++)
        this.pCollision = collision(cd, mw, mh, x, this.py + PLAYER_SIZE - 1 + this.pdy);
    } else if (this.pdx < 0) {
      for (let y = this.py; y < this.py + PLAYER_SIZE && !this.pCollision; y++)
        this.pCollision = collision(cd, mw, mh, this.px + this.pdx, y);
    } else if (this.pdy < 0) {
      for (let x = this.px; x < this.px + PLAYER_SIZE && !this.pCollision; x++)
        this.pCollision = collision(cd, mw, mh, x, this.py + this.pdy);
    }
  }

  private playerAnim(): void {   // PlayerAnim()
    if (!this.pCollision) {
      if (this.pdx !== 0 || this.pdy !== 0) {
        this.pAnimCycle = (this.pAnimCycle + MOVE_SPEED) % 18;
      }
      this.px += this.pdx;
      this.py += this.pdy;

      // Track direction for sprite rotation
      if (this.pdy > 0)  this.pDir = DIR_DOWN;
      else if (this.pdx < 0) this.pDir = DIR_LEFT;
      else if (this.pdy < 0) this.pDir = DIR_UP;
      else if (this.pdx > 0) this.pDir = DIR_RIGHT;
    }

    if (this.pPhaseAnim) {
      this.pPhaseAnimCycle += MOVE_SPEED;
      if (this.pPhaseAnimCycle >= TILE_SIZE) {
        this.pPhaseAnim = false;
        this.pPhaseAnimCycle = 0;
      }
    }
  }

  private playerDotCollision(): void {  // PlayerDotCollision()
    const cx = this.px + PLAYER_SIZE / 2;
    const cy = this.py + PLAYER_SIZE / 2;
    const tx0 = Math.floor(cx / TILE_SIZE) - 1;
    const ty0 = Math.floor(cy / TILE_SIZE) - 1;

    for (let ty = ty0; ty < ty0 + 3; ty++) {
      for (let tx = tx0; tx < tx0 + 3; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.sizeX || ty >= this.sizeY) continue;
        if (this.matrix[tx][ty] === TILE.EMPTY) continue;
        if (!this.dots[tx][ty]) continue;

        const dotCx = tx * TILE_SIZE + TILE_SIZE / 2;
        const dotCy = ty * TILE_SIZE + TILE_SIZE / 2;
        if (Math.sqrt((cx - dotCx) ** 2 + (cy - dotCy) ** 2) <= PLAYER_SIZE / 2) {
          this.dots[tx][ty] = false;
          this.dotCount--;
          this.pDotCount++;

          // Dot sound
          if (!this.dotLooping) {
            this.sound.play('audDot1');
            this.loopCyclesSinceDot = 1;
            this.dotLooping = true;
          } else {
            this.loopCyclesSinceDot = 0;
          }

          // Score / new life
          if (this.newLifeDivisor !== 0) {
            this.pNewLifeCountdown--;
            if (this.pNewLifeCountdown <= 0) {
              this.pLives++;
              this.sound.seekAndPlay('audNewLife');
              this.pNewLifeCountdown += this.pNewLifeDivisor;
            }
          }

          // Ghost powerup chargeup
          if (this.pGhostChargeup < GHOST_CHARGEUP_GOAL && !this.pGhostActive) {
            this.pGhostChargeup++;
            if (this.pGhostChargeup === GHOST_CHARGEUP_GOAL && !this.pGhostReady) {
              this.pGhostReady = true;
              this.sound.seekAndPlay('audPowerupGhostActive');
            }
          }
        }
      }
    }
  }

  private playerGhostCollision(): void {  // PlayerGhostCollision()
    const cx = this.playerCenterX(); const cy = this.playerCenterY();
    for (let i = 0; i < this.ghostCount && this.pAlive; i++) {
      const gcx = this.ghostCenterX(i); const gcy = this.ghostCenterY(i);
      if (Math.sqrt((cx - gcx) ** 2 + (cy - gcy) ** 2) <= PLAYER_SIZE / 2) {
        if (!this.pGhostActive && !this.gEaten[i]) {
          this.pAlive = false;
        } else if (this.pGhostActive && !this.gEaten[i]) {
          // Eat ghost
          this.pDotCount += Math.floor(200 / SCORE_PER_DOT);
          this.sound.stop('audGhostEaten');
          this.sound.play('audGhostEaten');
          this.gEaten[i] = true;
          this.gEatenCooldown[i] = Math.round(10 * T500_PER_SEC);
          if (this.newLifeDivisor !== 0) {
            this.pNewLifeCountdown -= Math.floor(200 / SCORE_PER_DOT);
            if (this.pNewLifeCountdown <= 0) {
              this.pLives++;
              this.pNewLifeCountdown += this.pNewLifeDivisor;
            }
          }
        }
      }
    }
  }

  private playerDeadAnim(): void {  // PlayerDeadAnim()
    if (this.pDeadAnimCycle >= 50) {
      if (this.pDeadAnimCycle === 50) {
        this.sound.stop('audPlayerDead');
        this.sound.seekAndPlay('audPlayerDead');
      }
      // Frame 82..125: held on last dead frame; >125: invisible
    }

    if (this.pDeadAnimCycle > 125 + Math.floor(3 * (1000 / TIMER_20))) {
      if (this.pLives - 1 <= 0) {
        this.pLives--;
        this.gameOver = true;
        this.endGame();
        this.onGameOver();
        return;
      } else {
        this.pLives--;
        this.onPlayerDead();
      }
    }
    this.pDeadAnimCycle += 2;
  }

  // ---------------------------------------------------------------------------
  // Keyboard input (called from main.ts)
  // ---------------------------------------------------------------------------

  keyDown(code: string): void {
    if (!this.gameStarted) return;
    const ms = MOVE_SPEED;
    const cd = this.collisionData; const mw = this.mapW; const mh = this.mapH;

    const tryKey = (dx: number, dy: number, dir: number) => {
      if (this.pDir !== dir) this.pCyclesSinceKey = 0;
      if (this.pCyclesSinceKey === 0) {
        let blocked = false;
        if (dx > 0) { for (let y = this.py; y < this.py + PLAYER_SIZE && !blocked; y++) blocked = collision(cd, mw, mh, this.px + PLAYER_SIZE - 1 + dx, y); }
        else if (dy > 0) { for (let x = this.px; x < this.px + PLAYER_SIZE && !blocked; x++) blocked = collision(cd, mw, mh, x, this.py + PLAYER_SIZE - 1 + dy); }
        else if (dx < 0) { for (let y = this.py; y < this.py + PLAYER_SIZE && !blocked; y++) blocked = collision(cd, mw, mh, this.px + dx, y); }
        else if (dy < 0) { for (let x = this.px; x < this.px + PLAYER_SIZE && !blocked; x++) blocked = collision(cd, mw, mh, x, this.py + dy); }
        this.pCollisionKey = blocked;
      }
      if (!this.pCollisionKey) { this.pdx = dx; this.pdy = dy; }
      else { this.pdxKey = dx; this.pdyKey = dy; }
    };

    switch (code) {
      case 'ArrowRight': tryKey( ms, 0,   DIR_RIGHT); break;
      case 'ArrowLeft':  tryKey(-ms, 0,   DIR_LEFT);  break;
      case 'ArrowUp':    tryKey(0,  -ms,  DIR_UP);    break;
      case 'ArrowDown':  tryKey(0,   ms,  DIR_DOWN);  break;

      case 'KeyX':
        if (this.pPhaseReady && this.pCollision && !this.pPhaseActive) {
          // Must not be at the map edge in the direction of travel
          const cx = this.px + PLAYER_SIZE / 2; const cy = this.py + PLAYER_SIZE / 2;
          const atEdge =
            (this.pDir === DIR_RIGHT && Math.floor(cx / TILE_SIZE) === this.sizeX - 1) ||
            (this.pDir === DIR_DOWN  && Math.floor(cy / TILE_SIZE) === this.sizeY - 1) ||
            (this.pDir === DIR_LEFT  && Math.floor(cx / TILE_SIZE) === 0) ||
            (this.pDir === DIR_UP    && Math.floor(cy / TILE_SIZE) === 0);
          if (!atEdge) {
            this.pPhaseActive = true;
            this.pPhaseAnim = true;
            this.pPhaseAnimCycle = 0;
            this.pPhaseReady = false;
            this.pPhaseCooldown = Math.round(5 * T500_PER_SEC);
            this.pPhaseCycles = 0;
            this.sound.seekAndPlay('audBonusItem');
          }
        }
        break;

      case 'Space':
        if (this.pGhostReady) {
          this.pGhostActive = true;
          this.pGhostReady = false;
          this.pGhostChargeup = 0;
          this.pGhostCycles = 0;
        }
        break;

      case 'Enter':
        if (this.startCycle >= 6 * T500_PER_SEC && !this.showExit) {
          this.paused = !this.paused;
          if (this.paused) this.sound.pauseAll();
          else this.sound.resumeAll();
        }
        break;

      case 'KeyY':
        if (this.showExit) { this.endGame(); this.setScreen('main'); }
        break;
      case 'KeyN':
        if (this.showExit) { this.showExit = false; this.paused = false; this.sound.resumeAll(); }
        break;
    }
  }

  keyDownGlobal(code: string): void {
    if (code === 'Escape') {
      if (!this.gameStarted) return;
      if (this.startCycle < 6 * T500_PER_SEC) return;
      if (!this.showExit) {
        this.showExit = true;
        this.paused = true;
        this.sound.pauseAll();
      } else {
        this.showExit = false;
        this.paused = false;
        this.sound.resumeAll();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers used by renderer
  // ---------------------------------------------------------------------------

  /** Pac-man animation frame index (0..17) → image key */
  get playerImageKey(): string {
    const frames = [6,7,8,9,8,7,6,5,4,3,2,1,0,1,2,3,4,5];
    const f = frames[this.pAnimCycle];
    if (!this.pAlive) {
      const dc = this.pDeadAnimCycle;
      const df = dc < 50 ? 0 : Math.min(dc - 50, 32);
      return `imgPacMan${df}`;
    }
    return this.pPhaseAnim ? `imgPacManPhase${f}` : `imgPacMan${f}`;
  }

  /** Returns 0..270 for canvas rotation of pac-man sprite */
  get playerRotation(): number {
    if (this.pDir === DIR_DOWN)  return 90;
    if (this.pDir === DIR_LEFT)  return 180;
    if (this.pDir === DIR_UP)    return 270;
    return 0;
  }

  /** Ghost image key for ghost i at current animation cycle */
  ghostImageKey(i: number): string {
    const frame = this.gAnimCycle;
    const dir = this.gDir[i];
    const dirName = ['Right','Down','Left','Up'][dir];

    if (this.gEaten[i]) {
      // Flashing logic: certain cooldown values show lightblue, others show eyes
      const cd = this.gEatenCooldown[i];
      const showEyes = cd > Math.round(5 * T500_PER_SEC) ||
        cd === Math.round(4 * T500_PER_SEC) ||
        cd === Math.round(2.5 * T500_PER_SEC) ||
        cd === Math.round(1.5 * T500_PER_SEC);
      if (showEyes) return `imgGhostEyes${dirName}`;
      return `imgGhostLightBlue${dirName}${frame}`;
    }

    if (this.pGhostActive) {
      // Flashing when warning (second half of powerup)
      const gc = this.pGhostCycles;
      const warn = gc === Math.round(5 * T500_PER_SEC) ||
        gc === Math.round(7 * T500_PER_SEC) ||
        gc === Math.round(8.5 * T500_PER_SEC) ||
        gc === Math.round(9.5 * T500_PER_SEC);
      if (warn) return `imgGhostLightBlue${dirName}${frame}`;
      return `imgGhostBlue${dirName}${frame}`;
    }

    const color = ['Green','Orange','Red'][i % 3];
    return `imgGhost${color}${dirName}${frame}`;
  }

  /** Whether ghost powerup is in warning phase (near expiry) */
  get ghostWarning(): boolean {
    const gc = this.pGhostCycles;
    return this.pGhostActive && gc >= Math.round(5 * T500_PER_SEC);
  }

  // ---------------------------------------------------------------------------
  // Ghost distance tracking (called after player/ghost position resets)
  // ---------------------------------------------------------------------------

  private updateGhostDistances(): void {
    const px = this.playerCenterX(); const py = this.playerCenterY();
    for (let i = 0; i < this.ghostCount; i++) {
      this.gPlayerDist[i] = this.dist(px, py, this.ghostCenterX(i), this.ghostCenterY(i));
    }
  }

  /** Overlay text to show on the game canvas */
  get overlayText(): string | null {
    if (this.startCycle < 4 * T500_PER_SEC) return 'READY?';
    if (this.startCycle < 6 * T500_PER_SEC && this.startCycle >= 4 * T500_PER_SEC) return 'START!';
    if (this.showExit) return 'END? Y/N';
    if (this.gameOver) return 'GAME OVER';
    if (this.paused && !this.gameOver && !this.showExit) return 'PAUSED';
    return null;
  }
}
