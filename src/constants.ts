// Dimensions — match the original VB.NET constants exactly
export const TILE_SIZE = 42;      // intMapPieceSize: square map tile size in pixels
export const WALL_SIZE = 7;       // intMapWallSize:  wall thickness within each tile
export const PLAYER_SIZE = 28;    // intPlayerSize:   pac-man/ghost sprite size
export const MOVE_SPEED = 2;      // intGameMovementFactor: pixels moved per tick

// Scoring
export const SCORE_PER_DOT = 50;                // intScoreDotMultiplier
export const GHOST_CHARGEUP_GOAL = 35;          // intPlayerPowerupGhostChargeupGoal

// Tile-type codes (intMapMatrix values)
export const TILE = {
  EMPTY:  0,   // border/open — no passage; drawn as wall on map edge
  RIGHT:  1,   // T-junction: closed on right  → exits up/down/left
  BOTTOM: 2,   // T-junction: closed on bottom → exits up/left/right
  LEFT:   3,   // T-junction: closed on left   → exits up/down/right
  TOP:    4,   // T-junction: closed on top    → exits down/left/right
  HORIZ:  5,   // Straight horizontal corridor → exits left/right
  VERT:   6,   // Straight vertical corridor   → exits up/down
  TL:     7,   // Corner: top-left walls       → exits right/down
  TR:     8,   // Corner: top-right walls      → exits left/down
  BL:     9,   // Corner: bottom-left walls    → exits right/up
  BR:    10,   // Corner: bottom-right walls   → exits left/up
  OPEN:  11,   // Four-way intersection        → exits all directions
} as const;

// Ghost color indices (ghost index % 3)
export const GHOST_GREEN  = 0;
export const GHOST_ORANGE = 1;
export const GHOST_RED    = 2;

// Directions (0=Right, 1=Down, 2=Left, 3=Up)
export const DIR_RIGHT = 0;
export const DIR_DOWN  = 1;
export const DIR_LEFT  = 2;
export const DIR_UP    = 3;
