/**
 * PacManX — entry point
 *
 * Manages HTML menus, canvas visibility, keyboard events, and
 * wires together Game, Renderer, and SoundManager.
 */

import './style.css';
import { SoundManager } from './audio';
import { Renderer }     from './renderer';
import { Game }         from './game';
import type { Screen }  from './game';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const menuEl  = document.getElementById('menu')!  as HTMLDivElement;
const canvasEl = document.getElementById('game')! as HTMLCanvasElement;

const sound    = new SoundManager();
const renderer = new Renderer(canvasEl);
const game     = new Game(sound, renderer);

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------

function showCanvas(): void {
  menuEl.style.display  = 'none';
  canvasEl.style.display = 'block';
}

function showMenu(): void {
  canvasEl.style.display = 'none';
  menuEl.style.display   = 'flex';
}

function renderScreen(screen: Screen): void {
  if (screen === 'arcade_game' || screen === 'quick_game') {
    showCanvas();
    return;
  }
  showMenu();
  switch (screen) {
    case 'main':          buildMainMenu();        break;
    case 'gamemodes':     buildGameModesMenu();   break;
    case 'quickmode':     buildQuickModeMenu();   break;
    case 'hiscores':      buildHiScores();        break;
    case 'instructions':  buildInstructions();    break;
    case 'hiscore_entry': buildHiScoreEntry();    break;
  }
}

game.on((_event, screen) => renderScreen(screen));

// ---------------------------------------------------------------------------
// Keyboard routing
// ---------------------------------------------------------------------------

document.addEventListener('keydown', e => {
  const screen = game.screen;

  if (screen === 'arcade_game' || screen === 'quick_game') {
    game.keyDownGlobal(e.code);
    game.keyDown(e.code);
    // Prevent arrow keys from scrolling
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }

  // Hi score entry — let the input element handle typing naturally;
  // Enter submits the form (wired via button click below).
});

// ---------------------------------------------------------------------------
// Menu builders
// ---------------------------------------------------------------------------

function h(tag: string, attrs: Record<string, string> = {}, ...children: (string | HTMLElement)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function setMenu(...els: HTMLElement[]): void {
  menuEl.innerHTML = '';
  for (const el of els) menuEl.appendChild(el);
}

// ----- Main menu -----
function buildMainMenu(): void {
  setMenu(
    h('h1', {}, 'PAC-MAN X'),
    btn('GAME MODES',   () => renderScreen('gamemodes')),
    btn('HI SCORES',    () => renderScreen('hiscores')),
    btn('INSTRUCTIONS', () => renderScreen('instructions')),
  );
}

// ----- Game modes menu -----
function buildGameModesMenu(): void {
  setMenu(
    h('h2', {}, 'GAME MODES'),
    btn('ARCADE', () => {
      game.startArcade();
      // screen event fires automatically
    }),
    btn('QUICK',  () => renderScreen('quickmode')),
    btn('BACK',   () => renderScreen('main')),
  );
}

// ----- Quick mode form -----
function buildQuickModeMenu(): void {
  function sel(id: string, options: [string, string][], defaultVal: string): HTMLElement {
    const s = document.createElement('select');
    s.id = id;
    for (const [label, value] of options) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      if (value === defaultVal) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  function row(label: string, control: HTMLElement): HTMLElement {
    const lbl = document.createElement('label');
    lbl.appendChild(document.createTextNode(label));
    lbl.appendChild(control);
    return lbl;
  }

  const mapSizes: [string, string][] = Array.from({ length: 10 }, (_, i) => {
    const n = (i + 6).toString();
    return [n, n];
  });

  const ghostSpeedSel = sel('qs-speed', [
    ['Easy', '10'], ['Medium', '9'], ['Hard/Challenge', '8'],
  ], '10');
  const ghostPopSel = sel('qs-pop', [
    ['Easy', '33'], ['Medium', '21'], ['Hard/Challenge', '11'],
  ], '33');
  const livesSel = sel('qs-lives', [
    ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
  ], '4');
  const newLifeSel = sel('qs-newlife', [
    ['5000 Points', '50'], ['10000 Points', '100'],
    ['20000 Points', '200'], ['Never', '0'],
  ], '50');
  const mapXSel = sel('qs-mapx', mapSizes, '6');
  const mapYSel = sel('qs-mapy', mapSizes, '6');

  const startBtn = btn('START', () => {
    game.startQuick({
      sizeX:         parseInt((mapXSel as HTMLSelectElement).value),
      sizeY:         parseInt((mapYSel as HTMLSelectElement).value),
      ghostSpeed:    parseInt((ghostSpeedSel as HTMLSelectElement).value),
      ghostDivisor:  parseInt((ghostPopSel as HTMLSelectElement).value),
      lives:         parseInt((livesSel as HTMLSelectElement).value),
      newLifeDivisor: parseInt((newLifeSel as HTMLSelectElement).value),
    });
  });

  setMenu(
    h('h2', {}, 'QUICK MODE'),
    row('Ghost Speed',      ghostSpeedSel),
    row('Ghost Population', ghostPopSel),
    row('Lives',            livesSel),
    row('New Life At',      newLifeSel),
    row('Map Width',        mapXSel),
    row('Map Height',       mapYSel),
    startBtn,
    btn('BACK', () => renderScreen('gamemodes')),
  );
}

// ----- Hi scores -----
function buildHiScores(): void {
  const scores = game.hiScores;

  const thead = h('tr', {},
    h('th', {}, '#'),
    h('th', {}, 'PLAYER'),
    h('th', {}, 'SCORE'),
    h('th', {}, 'MODE'),
  );

  const tbody = scores.map((s, i) =>
    h('tr', {},
      h('td', {}, (i + 1).toString()),
      h('td', {}, s.player),
      h('td', {}, s.score.toString()),
      h('td', {}, s.difficulty),
    )
  );

  const table = h('table', { class: 'hi-score-table' },
    h('thead', {}, thead),
    h('tbody', {}, ...tbody),
  );

  setMenu(
    h('h2', {}, 'HI SCORES'),
    table,
    btn('BACK', () => renderScreen('main')),
  );
}

// ----- Instructions -----
function buildInstructions(): void {
  function key(...labels: string[]): HTMLElement {
    const wrap = h('span', { class: 'key-group' });
    labels.forEach((label, i) => {
      const k = h('kbd', {}, label);
      wrap.appendChild(k);
      if (i < labels.length - 1) wrap.appendChild(document.createTextNode(' '));
    });
    return wrap;
  }

  function row(keyEl: HTMLElement, desc: string, sub?: string, icon?: string): HTMLElement {
    const r = h('div', { class: 'instr-row' });
    const keyCell = h('div', { class: 'instr-key' });
    keyCell.appendChild(keyEl);
    const descCell = h('div', { class: 'instr-desc' });
    if (icon) {
      const iconEl = document.createElement('img');
      iconEl.src = `${import.meta.env.BASE_URL}${icon}.gif`;
      iconEl.alt = '';
      iconEl.className = 'instr-icon';
      const mainLine = h('div', { class: 'instr-main-line' });
      mainLine.appendChild(iconEl);
      mainLine.appendChild(document.createTextNode(desc));
      descCell.appendChild(mainLine);
    } else {
      descCell.appendChild(document.createTextNode(desc));
    }
    if (sub) {
      const s = h('span', { class: 'instr-sub' }, sub);
      descCell.appendChild(s);
    }
    r.appendChild(keyCell);
    r.appendChild(descCell);
    return r;
  }

  function divider(): HTMLElement {
    return h('div', { class: 'instr-divider' });
  }

  const table = h('div', { class: 'instr-table' });
  table.appendChild(row(key('↑', '↓', '←', '→'), 'Move Pac-Man'));
  table.appendChild(row(key('X'), 'Phase through a wall', '·5 sec cooldown\n·must be facing a wall', 'imgPacManPhase5'));
  table.appendChild(row(key('Space'), 'Ghost Powerup', '·Ghosts edible for 10 sec\n·eat 35 dots to charge', 'imgGhostBlueRight0'));
  table.appendChild(row(key('Enter'), 'Pause / Unpause'));
  table.appendChild(row(key('Esc'), 'Exit game'));

  setMenu(
    h('h2', {}, 'INSTRUCTIONS'),
    table,
    btn('BACK', () => renderScreen('main')),
  );
}

// ----- Hi score entry -----
function buildHiScoreEntry(): void {
  const score = game.currentScore();

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 3;
  input.placeholder = 'AAA';
  input.autocomplete = 'off';

  const submitBtn = btn('SUBMIT', () => {
    const initials = input.value.trim().toUpperCase().slice(0, 3) || 'AAA';
    game.submitHiScore(initials, score, 'Arcade');
    renderScreen('hiscores');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitBtn.click();
  });

  const formRow = h('div', { class: 'form-row' }, input, submitBtn);

  setMenu(
    h('h2', {}, 'NEW HI SCORE!'),
    h('p', { class: 'instructions-text' }, `Score: ${score}`),
    h('p', { class: 'instructions-text' }, 'Enter your initials:'),
    formRow,
  );

  setTimeout(() => input.focus(), 0);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumeIcon   = document.getElementById('volume-icon')!;

volumeSlider.addEventListener('input', () => {
  const v = parseInt(volumeSlider.value) / 100;
  sound.setAllVolumes(v);
  volumeIcon.innerHTML = v === 0 ? '&#128263;' : v < 0.5 ? '&#128264;' : '&#128266;';
});

async function init(): Promise<void> {
  // Load assets in parallel
  await Promise.allSettled([sound.load(), renderer.load()]);
  // Show main menu
  renderScreen('main');
}

init();
