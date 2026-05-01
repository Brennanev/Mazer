const canvas = document.getElementById("game");
const context = canvas.getContext("2d");

const deviceOverlay = document.getElementById("device-overlay");
const pcButton = document.getElementById("pc-button");
const mobileButton = document.getElementById("mobile-button");
const menuScreen = document.getElementById("menu-screen");
const gameScreen = document.getElementById("game-screen");
const winScreen = document.getElementById("win-screen");
const introText = document.getElementById("intro-text");
const modeText = document.getElementById("mode-text");
const scoreText = document.getElementById("score-text");
const bestText = document.getElementById("best-text");
const objectiveText = document.getElementById("objective-text");
const winTitle = document.getElementById("win-title");
const winScore = document.getElementById("win-score");
const randomButton = document.getElementById("random-button");
const dailyButton = document.getElementById("daily-button");
const shiftButton = document.getElementById("shift-button");
const menuButton = document.getElementById("menu-button");
const replayButton = document.getElementById("replay-button");
const winMenuButton = document.getElementById("win-menu-button");
const refreshBoardButton = document.getElementById("refresh-board-button");
const leaderboardStatus = document.getElementById("leaderboard-status");
const leaderboardForm = document.getElementById("leaderboard-form");
const leaderboardName = document.getElementById("leaderboard-name");
const leaderboardSubmit = document.getElementById("leaderboard-submit");
const leaderboardList = document.getElementById("leaderboard-list");

const regularMazeSize = 37;
const dailyMazeSize = 47;
const shiftMazeSize = 37;
const moveIntervalMs = 46;
const mobileMoveIntervalMs = 12;
const preStartRevealRadius = 2.7;
const leaderboardStorageKey = "maze-game-daily-leaderboard-v2";
const leaderboardNameKey = "maze-game-daily-name-v2";
const leaderboardSubmitKey = "maze-game-daily-submitted-v2";
const leaderboardLimit = 10;

const heldKeys = [];

const game = {
  screen: "menu",
  mode: "random",
  maze: [],
  mazeSize: regularMazeSize,
  player: { col: 1, row: 1 },
  goal: { col: 1, row: 1 },
  start: { col: 1, row: 1 },
  score: 0,
  best: 0,
  won: false,
  hasStarted: false,
  elapsedMs: 0,
  moveCooldownMs: 0,
  trailPath: [{ col: 1, row: 1 }],
  dailyKey: getDailyKey(),
  deviceMode: null,
  swipeDirection: null,
  touchStart: null,
  key: null,
  lock: null,
  hasKey: false,
  shift: {
    stage: 1,
    returnMaze: null,
    returnGoal: { col: 1, row: 1 },
    animation: {
      active: false,
      startTime: 0,
      duration: 900,
      pieces: [],
      fromMaze: null,
      toMaze: null
    }
  },
  leaderboardEntries: [],
  leaderboardSubmitted: false,
  lastFrameTime: 0
};

function getDailyKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isMobileMode() {
  return game.deviceMode === "mobile";
}

function updateControlCopy() {
  if (isMobileMode()) {
    introText.innerHTML = "Pick a mode, then <strong>swipe on the maze</strong>. Each swipe carries you through a corridor until a turn, intersection, or dead end.";
    return;
  }

  introText.innerHTML = "Pick a mode, then navigate the maze with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys.";
}

function chooseDeviceMode(mode) {
  game.deviceMode = mode;
  game.swipeDirection = null;
  game.touchStart = null;
  heldKeys.splice(0, heldKeys.length);
  updateControlCopy();
  deviceOverlay.classList.add("hidden");
}

function normalizeKey(key) {
  const value = key.toLowerCase();

  if (value === "arrowup") {
    return "w";
  }
  if (value === "arrowleft") {
    return "a";
  }
  if (value === "arrowdown") {
    return "s";
  }
  if (value === "arrowright") {
    return "d";
  }

  return value;
}

function storageAvailable() {
  try {
    localStorage.setItem("__maze_probe__", "1");
    localStorage.removeItem("__maze_probe__");
    return true;
  } catch (error) {
    return false;
  }
}

function readJson(key, fallback) {
  if (!storageAvailable()) {
    return fallback;
  }

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!storageAvailable()) {
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

function bestStorageKey() {
  if (game.mode === "daily") {
    return `maze-best-daily-${game.dailyKey}`;
  }

  if (game.mode === "shift") {
    return "maze-best-shift";
  }

  return "maze-best-random";
}

function loadBest() {
  const stored = Number(localStorage.getItem(bestStorageKey()));
  return Number.isFinite(stored) && stored >= 0 ? stored : 0;
}

function saveBest() {
  localStorage.setItem(bestStorageKey(), String(game.best));
}

function tileSize() {
  return canvas.width / game.mazeSize;
}

function currentMoveInterval() {
  return isMobileMode() ? mobileMoveIntervalMs : moveIntervalMs;
}

function formatRunTime(milliseconds) {
  const safe = Math.max(0, Math.floor(milliseconds));
  const totalTenths = Math.floor(safe / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function createSeededRandom(seedText) {
  let seed = 2166136261;

  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createGrid(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 1));
}

function shuffle(items, random = Math.random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function carveMaze(grid, col, row, random) {
  const size = grid.length;
  grid[row][col] = 0;

  const directions = [
    { col: 0, row: -2 },
    { col: 2, row: 0 },
    { col: 0, row: 2 },
    { col: -2, row: 0 }
  ];

  shuffle(directions, random);

  directions.forEach((direction) => {
    const nextCol = col + direction.col;
    const nextRow = row + direction.row;

    if (
      nextCol <= 0 ||
      nextRow <= 0 ||
      nextCol >= size - 1 ||
      nextRow >= size - 1 ||
      grid[nextRow][nextCol] === 0
    ) {
      return;
    }

    grid[row + direction.row / 2][col + direction.col / 2] = 0;
    carveMaze(grid, nextCol, nextRow, random);
  });
}

function openSpawnPocket(grid) {
  const cells = [
    [1, 1],
    [2, 1],
    [1, 2],
    [3, 1],
    [1, 3]
  ];

  cells.forEach(([col, row]) => {
    if (grid[row] && typeof grid[row][col] !== "undefined") {
      grid[row][col] = 0;
    }
  });
}

function openNeighbors(grid, col, row) {
  return [
    { col: col + 1, row },
    { col: col - 1, row },
    { col, row: row + 1 },
    { col, row: row - 1 }
  ].filter((cell) => grid[cell.row]?.[cell.col] === 0);
}

function distanceMap(grid, startCol, startRow) {
  const queue = [{ col: startCol, row: startRow, distance: 0 }];
  const distances = new Map([[`${startCol},${startRow}`, 0]]);
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    openNeighbors(grid, current.col, current.row).forEach((neighbor) => {
      const key = `${neighbor.col},${neighbor.row}`;
      if (distances.has(key)) {
        return;
      }

      distances.set(key, current.distance + 1);
      queue.push({
        col: neighbor.col,
        row: neighbor.row,
        distance: current.distance + 1
      });
    });
  }

  return distances;
}

function farthestCell(grid, startCol, startRow) {
  const distances = distanceMap(grid, startCol, startRow);
  let best = { col: startCol, row: startRow, distance: 0 };

  distances.forEach((distance, key) => {
    if (distance > best.distance) {
      const [col, row] = key.split(",").map(Number);
      best = { col, row, distance };
    }
  });

  return best;
}

function shortestPath(grid, startCol, startRow, goalCol, goalRow) {
  const queue = [{ col: startCol, row: startRow }];
  const parents = new Map([[`${startCol},${startRow}`, null]]);
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (current.col === goalCol && current.row === goalRow) {
      const path = [];
      let key = `${goalCol},${goalRow}`;

      while (key) {
        const [col, row] = key.split(",").map(Number);
        path.push({ col, row });
        key = parents.get(key);
      }

      path.reverse();
      return path;
    }

    openNeighbors(grid, current.col, current.row).forEach((neighbor) => {
      const key = `${neighbor.col},${neighbor.row}`;
      if (parents.has(key)) {
        return;
      }

      parents.set(key, `${current.col},${current.row}`);
      queue.push(neighbor);
    });
  }

  return null;
}

function placeDailyKeyAndLock(grid, goal) {
  const path = shortestPath(grid, 1, 1, goal.col, goal.row);
  if (!path || path.length < 12) {
    return { key: null, lock: null };
  }

  const lockIndex = Math.max(6, Math.min(path.length - 4, Math.floor(path.length * 0.72)));
  const lock = { col: path[lockIndex].col, row: path[lockIndex].row };
  const distances = distanceMap(grid, 1, 1);

  const candidates = [];
  distances.forEach((distance, key) => {
    const [col, row] = key.split(",").map(Number);

    if (
      (col === 1 && row === 1) ||
      (col === goal.col && row === goal.row) ||
      (col === lock.col && row === lock.row)
    ) {
      return;
    }

    const pathIndex = path.findIndex((cell) => cell.col === col && cell.row === row);
    if (pathIndex >= lockIndex) {
      return;
    }

    const lockDistance = Math.abs(lock.col - col) + Math.abs(lock.row - row);
    candidates.push({
      col,
      row,
      score: distance * 3 + lockDistance * 5 + Math.abs(lockIndex - Math.max(pathIndex, 0)) * 2
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];

  return {
    key: best ? { col: best.col, row: best.row } : null,
    lock
  };
}

function addLoops(grid, random, count) {
  const candidates = [];
  const size = grid.length;

  for (let row = 1; row < size - 1; row += 1) {
    for (let col = 1; col < size - 1; col += 1) {
      if (grid[row][col] !== 1) {
        continue;
      }

      const horizontal = grid[row][col - 1] === 0 && grid[row][col + 1] === 0;
      const vertical = grid[row - 1][col] === 0 && grid[row + 1][col] === 0;

      if (horizontal || vertical) {
        candidates.push({ col, row });
      }
    }
  }

  shuffle(candidates, random);

  for (let index = 0; index < Math.min(count, candidates.length); index += 1) {
    const candidate = candidates[index];
    grid[candidate.row][candidate.col] = 0;
  }
}

function edgeDetour(grid, random, side) {
  const size = grid.length;
  const span = Math.max(10, Math.floor(size * 0.55));
  const start = Math.max(1, Math.min(size - 2 - span, Math.floor(random() * (size - 2 - span)) + 1));
  const end = Math.min(size - 2, start + span);

  if (side === "top" || side === "bottom") {
    const row = side === "top" ? 1 : size - 2;
    for (let col = start; col <= end; col += 1) {
      grid[row][col] = 0;
    }
    return;
  }

  const col = side === "left" ? 1 : size - 2;
  for (let row = start; row <= end; row += 1) {
    grid[row][col] = 0;
  }
}

function addEdgeDetours(grid, random, count) {
  const sides = ["top", "right", "bottom", "left"];
  shuffle(sides, random);

  for (let index = 0; index < Math.min(count, sides.length); index += 1) {
    edgeDetour(grid, random, sides[index]);
  }
}

function buildMaze(size, random, options = {}) {
  const candidateCount = options.candidates || 28;
  const loopCount = options.loops || 0;
  const detourCount = options.detours || 0;
  let best = null;

  for (let attempt = 0; attempt < candidateCount; attempt += 1) {
    const grid = createGrid(size);
    carveMaze(grid, 1, 1, random);
    openSpawnPocket(grid);
    addLoops(grid, random, loopCount);
    addEdgeDetours(grid, random, detourCount);

    const farthest = farthestCell(grid, 1, 1);
    const score = farthest.distance;

    if (!best || score > best.score) {
      best = {
        grid,
        goal: { col: farthest.col, row: farthest.row },
        score
      };
    }
  }

  return best;
}

function buildShiftMode(random) {
  const first = buildMaze(shiftMazeSize, random, {
    candidates: 18,
    loops: 5,
    detours: 2
  });
  const second = buildMaze(shiftMazeSize, random, {
    candidates: 18,
    loops: 5,
    detours: 2
  });

  second.grid[first.goal.row][first.goal.col] = 0;
  openSpawnPocket(second.grid);

  return {
    grid: first.grid,
    goal: first.goal,
    returnMaze: second.grid
  };
}

function wallCells(grid) {
  const cells = [];

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === 1) {
        cells.push({ col, row });
      }
    }
  }

  return cells;
}

function buildShiftPieces(fromMaze, toMaze) {
  const fromWalls = wallCells(fromMaze);
  const toWalls = wallCells(toMaze);
  const pieces = [];
  const limit = Math.max(fromWalls.length, toWalls.length);

  for (let index = 0; index < limit; index += 1) {
    const from = fromWalls[index] || toWalls[index];
    const to = toWalls[index] || fromWalls[index];

    pieces.push({
      fromCol: from.col,
      fromRow: from.row,
      toCol: to.col,
      toRow: to.row
    });
  }

  return pieces;
}

function startShiftAnimation() {
  game.shift.animation = {
    active: true,
    startTime: performance.now(),
    duration: 1800,
    pieces: buildShiftPieces(game.maze, game.shift.returnMaze),
    fromMaze: game.maze.map((row) => [...row]),
    toMaze: game.shift.returnMaze.map((row) => [...row])
  };
  game.moveCooldownMs = 0;
}

function completeShiftAnimation() {
  game.shift.stage = 2;
  game.maze = game.shift.returnMaze;
  game.goal = { ...game.start };
  game.trailPath = [{ col: game.player.col, row: game.player.row }];
  game.moveCooldownMs = 0;
  game.shift.animation = {
    active: false,
    startTime: 0,
    duration: 1800,
    pieces: [],
    fromMaze: null,
    toMaze: null
  };
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function updateTrailPath(nextCol, nextRow) {
  const existingIndex = game.trailPath.findIndex(
    (cell) => cell.col === nextCol && cell.row === nextRow
  );

  if (existingIndex !== -1) {
    game.trailPath = game.trailPath.slice(0, existingIndex + 1);
    return;
  }

  game.trailPath.push({ col: nextCol, row: nextRow });
}

function mazeIsLoaded() {
  return Array.isArray(game.maze) && game.maze.length > 0;
}

function canEnter(col, row) {
  if (game.mode === "shift" && game.shift.animation.active) {
    return false;
  }

  if (game.maze[row]?.[col] !== 0) {
    return false;
  }

  if (
    game.mode === "daily" &&
    !game.hasKey &&
    game.lock &&
    game.lock.col === col &&
    game.lock.row === row
  ) {
    return false;
  }

  return true;
}

function directionDelta(direction) {
  if (direction === "w") {
    return { col: 0, row: -1 };
  }
  if (direction === "a") {
    return { col: -1, row: 0 };
  }
  if (direction === "s") {
    return { col: 0, row: 1 };
  }
  if (direction === "d") {
    return { col: 1, row: 0 };
  }

  return null;
}

function shouldStopSwipe(direction) {
  const delta = directionDelta(direction);
  if (!delta) {
    return true;
  }

  const options = [
    { key: "w", col: 0, row: -1 },
    { key: "a", col: -1, row: 0 },
    { key: "s", col: 0, row: 1 },
    { key: "d", col: 1, row: 0 }
  ].filter((option) => canEnter(game.player.col + option.col, game.player.row + option.row));

  const reverseCol = -delta.col;
  const reverseRow = -delta.row;
  const forwardOpen = options.some((option) => option.col === delta.col && option.row === delta.row);
  const nonReverseOptions = options.filter(
    (option) => !(option.col === reverseCol && option.row === reverseRow)
  );

  if (!forwardOpen) {
    return true;
  }

  if (nonReverseOptions.length > 1) {
    return true;
  }

  if (
    nonReverseOptions.length === 1 &&
    !(nonReverseOptions[0].col === delta.col && nonReverseOptions[0].row === delta.row)
  ) {
    return true;
  }

  return false;
}

function queueSwipe(direction) {
  if (!isMobileMode() || game.screen !== "game" || game.won || game.shift.animation.active) {
    return;
  }

  const delta = directionDelta(direction);
  if (!delta) {
    return;
  }

  game.swipeDirection = direction;

  if (game.moveCooldownMs === 0) {
    if (applyMove(delta.col, delta.row)) {
      game.moveCooldownMs = currentMoveInterval();

      if (shouldStopSwipe(direction)) {
        game.swipeDirection = null;
      }
    } else {
      game.swipeDirection = null;
    }
  }
}

function applyMove(deltaCol, deltaRow) {
  if (!mazeIsLoaded() || game.won || game.shift.stage === 99) {
    return false;
  }

  const nextCol = game.player.col + deltaCol;
  const nextRow = game.player.row + deltaRow;

  if (!canEnter(nextCol, nextRow)) {
    return false;
  }

  game.hasStarted = true;
  game.player.col = nextCol;
  game.player.row = nextRow;
  updateTrailPath(nextCol, nextRow);

  if (
    game.mode === "daily" &&
    !game.hasKey &&
    game.key &&
    game.player.col === game.key.col &&
    game.player.row === game.key.row
  ) {
    game.hasKey = true;
    game.key = null;
  }

  if (game.player.col === game.goal.col && game.player.row === game.goal.row) {
    if (game.mode === "shift" && game.shift.stage === 1) {
      startShiftAnimation();
    } else {
      finishRun();
    }
  }

  updateHud();
  draw();
  return true;
}

function currentDirection() {
  return directionDelta(heldKeys[0]);
}

function finishRun() {
  game.won = true;

  if (game.best === 0 || game.score < game.best) {
    game.best = game.score;
    saveBest();
  }

  if (game.mode === "daily") {
    updateLeaderboardSubmissionState();
  }

  winTitle.textContent = game.mode === "shift" ? "Shift Maze Complete" : "Maze Complete";
  winScore.textContent = `Final time: ${formatRunTime(game.score)}`;
  winScreen.classList.remove("hidden");
  renderLeaderboard();
}

function startMode(mode) {
  const random =
    mode === "daily"
      ? createSeededRandom(`maze-daily-${game.dailyKey}`)
      : Math.random;

  game.mode = mode;
  game.won = false;
  game.hasStarted = false;
  game.elapsedMs = 0;
  game.moveCooldownMs = 0;
  game.trailPath = [{ col: 1, row: 1 }];
  heldKeys.splice(0, heldKeys.length);
  game.swipeDirection = null;
  game.touchStart = null;
  winScreen.classList.add("hidden");
  game.key = null;
  game.lock = null;
  game.hasKey = false;

  if (mode === "shift") {
    const shiftData = buildShiftMode(random);
    game.maze = shiftData.grid;
    game.mazeSize = shiftMazeSize;
    game.start = { col: 1, row: 1 };
    game.player = { ...game.start };
    game.goal = shiftData.goal;
    game.shift = {
      stage: 1,
      returnMaze: shiftData.returnMaze,
      returnGoal: { col: 1, row: 1 },
      animation: {
        active: false,
        startTime: 0,
        duration: 900,
        pieces: [],
        fromMaze: null,
        toMaze: null
      }
    };
  } else {
    const size = mode === "daily" ? dailyMazeSize : regularMazeSize;
    const mazeData = buildMaze(size, random, {
      candidates: mode === "daily" ? 36 : 28,
      loops: mode === "daily" ? 8 : 5,
      detours: mode === "daily" ? 3 : 2
    });

    game.maze = mazeData.grid;
    game.mazeSize = size;
    game.start = { col: 1, row: 1 };
    game.player = { ...game.start };
    game.goal = mazeData.goal;
    if (mode === "daily") {
      const lockAndKey = placeDailyKeyAndLock(game.maze, game.goal);
      game.key = lockAndKey.key;
      game.lock = lockAndKey.lock;
    }
    game.shift = {
      stage: 1,
      returnMaze: null,
      returnGoal: { col: 1, row: 1 },
      animation: {
        active: false,
        startTime: 0,
        duration: 900,
        pieces: [],
        fromMaze: null,
        toMaze: null
      }
    };
  }

  game.score = 0;
  game.best = loadBest();
  game.screen = "game";
  menuScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  canvas.focus();
  updateLeaderboardSubmissionState();
  updateHud();
  draw();
}

function replayMode() {
  startMode(game.mode);
}

function returnToMenu() {
  heldKeys.splice(0, heldKeys.length);
  game.swipeDirection = null;
  game.touchStart = null;
  game.screen = "menu";
  menuScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  winScreen.classList.add("hidden");
  renderLeaderboard();
}

function updateHud() {
  const modeLabel =
    game.mode === "daily" ? `Daily ${game.dailyKey}` :
    game.mode === "shift" ? `Shift Maze ${game.shift.stage}/2` :
    "Random";

  modeText.textContent = modeLabel;
  scoreText.textContent = formatRunTime(game.score);
  bestText.textContent = game.best > 0 ? formatRunTime(game.best) : "--:--.-";

  if (game.mode === "shift") {
    if (game.shift.animation.active) {
      objectiveText.textContent = "Maze shifting...";
      return;
    }

    objectiveText.textContent =
      game.shift.stage === 1
        ? "Reach the far marker"
        : "Return to the start";
    return;
  }

  if (game.mode === "daily") {
    objectiveText.textContent = game.hasKey ? "Reach the goal" : "Find the key to unlock the route";
    return;
  }

  objectiveText.textContent = "Reach the goal";
}

function drawMaze() {
  drawMazeGrid(game.maze);
}

function drawMazeGrid(grid) {
  const size = grid.length;
  const unit = tileSize();

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const x = col * unit;
      const y = row * unit;
      const wall = grid[row][col] === 1;

      context.fillStyle = wall ? "#1a2632" : "#edf6f9";
      context.fillRect(x, y, unit, unit);

      if (wall) {
        context.fillStyle = "#233443";
        context.fillRect(x + 4, y + 4, unit - 8, unit - 8);
      }
    }
  }
}

function drawShiftAnimation() {
  if (!(game.mode === "shift" && game.shift.animation.active)) {
    return false;
  }

  const unit = tileSize();
  const { startTime, duration, pieces } = game.shift.animation;
  const progress = Math.min(1, (performance.now() - startTime) / duration);
  const eased = easeInOutSine(progress);
  const drift = Math.sin(progress * Math.PI) * unit * 0.28;

  context.fillStyle = "#edf6f9";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.globalAlpha = 0.18 * (1 - eased);
  if (game.shift.animation.fromMaze) {
    drawMazeGrid(game.shift.animation.fromMaze);
  }
  context.restore();

  pieces.forEach((piece, index) => {
    const fromX = piece.fromCol * unit;
    const fromY = piece.fromRow * unit;
    const toX = piece.toCol * unit;
    const toY = piece.toRow * unit;
    const directionX = toX - fromX;
    const directionY = toY - fromY;
    const length = Math.hypot(directionX, directionY) || 1;
    const normalX = -directionY / length;
    const normalY = directionX / length;
    const arcOffset = Math.sin(progress * Math.PI) * drift * (0.6 + (index % 5) * 0.08);
    const x = fromX + directionX * eased + normalX * arcOffset;
    const y = fromY + directionY * eased + normalY * arcOffset;
    const wobble = Math.sin(progress * Math.PI * 3 + index * 0.17) * unit * 0.015 * (1 - progress);
    const scale = 1 + Math.sin(progress * Math.PI) * 0.06;
    const inset = Math.max(3, unit * 0.12);

    context.fillStyle = "#1a2632";
    context.fillRect(
      x + unit * (1 - scale) * 0.5,
      y + unit * (1 - scale) * 0.5,
      unit * scale,
      unit * scale
    );
    context.fillStyle = "#233443";
    context.fillRect(
      x + inset + wobble,
      y + inset - wobble,
      unit - inset * 2,
      unit - inset * 2
    );
  });

  context.fillStyle = `rgba(7, 15, 24, ${0.12 + Math.sin(progress * Math.PI) * 0.08})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.font = "bold 36px Arial";
  context.textAlign = "center";
  context.fillText("The maze is shifting...", canvas.width / 2, canvas.height * 0.5);

  if (progress >= 1) {
    completeShiftAnimation();
  }

  return true;
}

function drawGoal() {
  const unit = tileSize();
  const x = game.goal.col * unit;
  const y = game.goal.row * unit;
  const returnStage = game.mode === "shift" && game.shift.stage === 2;
  const pulse = 1 + Math.sin(performance.now() / 220) * 0.08;
  const outerInset = Math.max(1.5, unit * (0.08 - (pulse - 1) * 0.18));
  const innerInset = Math.max(3.5, unit * (0.18 - (pulse - 1) * 0.24));

  context.fillStyle = returnStage ? "rgba(116, 192, 252, 0.2)" : "rgba(149, 213, 178, 0.2)";
  context.fillRect(x + 2, y + 2, unit - 4, unit - 4);
  context.fillStyle = returnStage ? "#74c0fc" : "#95d5b2";
  context.fillRect(x + outerInset, y + outerInset, unit - outerInset * 2, unit - outerInset * 2);
  context.fillStyle = returnStage ? "#1d4f91" : "#2d6a4f";
  context.fillRect(x + innerInset, y + innerInset, unit - innerInset * 2, unit - innerInset * 2);
}

function drawDailyLockAndKey() {
  if (game.mode !== "daily") {
    return;
  }

  const unit = tileSize();

  if (!game.hasKey && game.lock) {
    const x = game.lock.col * unit;
    const y = game.lock.row * unit;
    const pulse = 1 + Math.sin(performance.now() / 240) * 0.04;
    const lockInset = unit * 0.1;
    const bodyWidth = unit * 0.44 * pulse;
    const bodyHeight = unit * 0.24 * pulse;

    context.fillStyle = "rgba(255, 159, 28, 0.2)";
    context.fillRect(x + unit * 0.04, y + unit * 0.04, unit * 0.92, unit * 0.92);
    context.strokeStyle = "#ff9f1c";
    context.lineWidth = Math.max(2, unit * 0.1);
    context.strokeRect(x + lockInset, y + lockInset, unit - lockInset * 2, unit - lockInset * 2);

    context.fillStyle = "#ff9f1c";
    context.fillRect(
      x + unit * 0.5 - bodyWidth / 2,
      y + unit * 0.48 - bodyHeight / 2,
      bodyWidth,
      bodyHeight
    );
    context.beginPath();
    context.arc(x + unit * 0.5, y + unit * 0.36, unit * 0.2 * pulse, Math.PI, 0);
    context.stroke();
  }

  if (game.key) {
    const centerX = game.key.col * unit + unit / 2;
    const centerY = game.key.row * unit + unit / 2;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.26;

    context.fillStyle = "rgba(255, 209, 102, 0.2)";
    context.beginPath();
    context.arc(centerX, centerY, unit * 0.42 * pulse, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#ffd166";
    context.lineWidth = Math.max(3, unit * 0.13);
    context.beginPath();
    context.arc(centerX - unit * 0.12, centerY, unit * 0.28 * pulse, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "#f4a261";
    context.lineWidth = Math.max(4, unit * 0.18);
    context.beginPath();
    context.moveTo(centerX + unit * 0.1, centerY);
    context.lineTo(centerX + unit * 0.42, centerY);
    context.lineTo(centerX + unit * 0.42, centerY + unit * 0.2);
    context.moveTo(centerX + unit * 0.24, centerY);
    context.lineTo(centerX + unit * 0.24, centerY + unit * 0.22);
    context.stroke();
  }
}

function drawTrail() {
  if (game.trailPath.length < 2) {
    return;
  }

  const unit = tileSize();
  const trailWidth = unit * 0.62;

  context.fillStyle = "#40916c";

  for (let index = 0; index < game.trailPath.length; index += 1) {
    const cell = game.trailPath[index];
    const centerX = cell.col * unit + unit / 2;
    const centerY = cell.row * unit + unit / 2;

    context.fillRect(
      centerX - trailWidth / 2,
      centerY - trailWidth / 2,
      trailWidth,
      trailWidth
    );

    if (index === 0) {
      continue;
    }

    const previous = game.trailPath[index - 1];
    const previousCenterX = previous.col * unit + unit / 2;
    const previousCenterY = previous.row * unit + unit / 2;

    if (previous.row === cell.row) {
      const left = Math.min(previousCenterX, centerX);
      context.fillRect(
        left,
        centerY - trailWidth / 2,
        Math.abs(centerX - previousCenterX),
        trailWidth
      );
    } else {
      const top = Math.min(previousCenterY, centerY);
      context.fillRect(
        centerX - trailWidth / 2,
        top,
        trailWidth,
        Math.abs(centerY - previousCenterY)
      );
    }
  }
}

function drawPlayer() {
  const unit = tileSize();
  const centerX = game.player.col * unit + unit / 2;
  const centerY = game.player.row * unit + unit / 2;
  const pulse = !game.hasStarted ? 1 + Math.sin(performance.now() / 180) * 0.1 : 1;
  const radius = unit * 0.36 * pulse;

  if (!game.hasStarted) {
    context.fillStyle = "rgba(64, 145, 108, 0.18)";
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.65, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "#40916c";
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = Math.max(2, unit * 0.08);
  context.strokeStyle = "#1b4332";
  context.stroke();
}

function drawPreStartFog() {
  if (game.hasStarted) {
    return;
  }

  const unit = tileSize();
  const centerX = game.player.col * unit + unit / 2;
  const centerY = game.player.row * unit + unit / 2;
  const radius = unit * preStartRevealRadius;

  context.save();
  context.fillStyle = "rgba(0, 0, 0, 0.985)";
  context.beginPath();
  context.rect(0, 0, canvas.width, canvas.height);
  context.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
  context.fill("evenodd");
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  context.fillStyle = "rgba(0, 0, 0, 0.6)";
  context.fillRect(canvas.width * 0.12, canvas.height * 0.38, canvas.width * 0.76, 96);
  context.fillStyle = "#ffffff";
  context.font = "bold 30px Arial";
  context.textAlign = "center";
  context.fillText(
    isMobileMode() ? "Swipe to start" : "Press WASD or Arrow Keys to start",
    canvas.width / 2,
    canvas.height * 0.47
  );
}

function draw() {
  if (!mazeIsLoaded()) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (drawShiftAnimation()) {
    return;
  }

  drawMaze();
  drawGoal();
  drawDailyLockAndKey();
  drawTrail();
  drawPlayer();
  drawPreStartFog();
}

function updateScore(deltaTimeMs) {
  if (!game.hasStarted || game.won || game.shift.stage === 99 || game.shift.animation.active) {
    return;
  }

  game.elapsedMs += deltaTimeMs;
  game.score = game.elapsedMs;
}

function gameFrame(timestamp) {
  const deltaTimeMs = Math.min(32, timestamp - game.lastFrameTime || 16);
  game.lastFrameTime = timestamp;

  updateScore(deltaTimeMs);

  if (game.moveCooldownMs > 0) {
    game.moveCooldownMs = Math.max(0, game.moveCooldownMs - deltaTimeMs);
  }

  if (!game.won && game.moveCooldownMs === 0 && game.screen === "game") {
    if (!isMobileMode() && heldKeys.length > 0) {
      const direction = currentDirection();
      if (direction && applyMove(direction.col, direction.row)) {
        game.moveCooldownMs = currentMoveInterval();
      }
    } else if (isMobileMode() && game.swipeDirection) {
      const direction = directionDelta(game.swipeDirection);
      if (direction && applyMove(direction.col, direction.row)) {
        game.moveCooldownMs = currentMoveInterval();

        if (shouldStopSwipe(game.swipeDirection)) {
          game.swipeDirection = null;
        }
      } else {
        game.swipeDirection = null;
      }
    }
  }

  updateHud();
  draw();
  requestAnimationFrame(gameFrame);
}

function pushHeldKey(key) {
  if (!["w", "a", "s", "d"].includes(key)) {
    return;
  }

  const existingIndex = heldKeys.indexOf(key);
  if (existingIndex !== -1) {
    heldKeys.splice(existingIndex, 1);
  }

  heldKeys.unshift(key);
}

function removeHeldKey(key) {
  const existingIndex = heldKeys.indexOf(key);
  if (existingIndex !== -1) {
    heldKeys.splice(existingIndex, 1);
  }
}

function handleKeyDown(event) {
  const key = normalizeKey(event.key);

  if (key === "enter" && !winScreen.classList.contains("hidden")) {
    event.preventDefault();
    replayMode();
    return;
  }

  if (!["w", "a", "s", "d"].includes(key)) {
    return;
  }

  if (isMobileMode()) {
    return;
  }

  event.preventDefault();

  if (game.screen !== "game" || game.won) {
    return;
  }

  if (!event.repeat) {
    pushHeldKey(key);

    if (game.moveCooldownMs === 0) {
      if (applyMove(currentDirection().col, currentDirection().row)) {
        game.moveCooldownMs = currentMoveInterval();
      }
    }

    return;
  }

  if (!heldKeys.includes(key)) {
    pushHeldKey(key);
  }
}

function handleKeyUp(event) {
  if (isMobileMode()) {
    return;
  }

  const key = normalizeKey(event.key);

  if (["w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    removeHeldKey(key);
  }
}

function handleTouchStart(event) {
  if (!isMobileMode() || game.screen !== "game" || game.won) {
    return;
  }

  event.preventDefault();

  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  game.touchStart = { x: touch.clientX, y: touch.clientY };
}

function handleTouchMove(event) {
  if (!isMobileMode() || game.screen !== "game" || game.won) {
    return;
  }

  event.preventDefault();
}

function handleTouchEnd(event) {
  if (!isMobileMode() || game.screen !== "game" || game.won || !game.touchStart) {
    return;
  }

  event.preventDefault();

  const touch = event.changedTouches[0];
  if (!touch) {
    game.touchStart = null;
    return;
  }

  const deltaX = touch.clientX - game.touchStart.x;
  const deltaY = touch.clientY - game.touchStart.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const threshold = 18;

  game.touchStart = null;

  if (absX < threshold && absY < threshold) {
    return;
  }

  if (absX > absY) {
    queueSwipe(deltaX > 0 ? "d" : "a");
    return;
  }

  queueSwipe(deltaY > 0 ? "s" : "w");
}

function leaderboardData() {
  return readJson(leaderboardStorageKey, {});
}

function saveLeaderboardData(data) {
  writeJson(leaderboardStorageKey, data);
}

function sortLeaderboard(entries) {
  return [...entries].sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    return new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime();
  });
}

function updateLeaderboardSubmissionState() {
  const submitted = readJson(leaderboardSubmitKey, {});
  game.leaderboardSubmitted = Boolean(submitted[game.dailyKey]);
}

function renderLeaderboard() {
  leaderboardList.innerHTML = "";
  leaderboardForm.classList.toggle("hidden", !(game.mode === "daily" && game.won && !game.leaderboardSubmitted));

  const entries = game.leaderboardEntries;

  if (entries.length === 0) {
    const item = document.createElement("li");
    item.className = "leaderboard-entry";
    item.innerHTML = '<span class="leaderboard-rank">-</span><span><strong class="leaderboard-name">No scores yet today</strong><span class="leaderboard-meta">Be the first.</span></span><span class="leaderboard-score">-</span>';
    leaderboardList.appendChild(item);
    return;
  }

  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-entry";

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = String(index + 1);

    const textWrap = document.createElement("span");
    const name = document.createElement("strong");
    name.className = "leaderboard-name";
    name.textContent = entry.name;
    const meta = document.createElement("span");
    meta.className = "leaderboard-meta";
    meta.textContent = new Date(entry.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    textWrap.append(name, meta);

    const score = document.createElement("span");
    score.className = "leaderboard-score";
    score.textContent = formatRunTime(entry.score);

    item.append(rank, textWrap, score);
    leaderboardList.appendChild(item);
  });
}

function refreshLeaderboard() {
  const data = leaderboardData();
  game.leaderboardEntries = sortLeaderboard(data[game.dailyKey] || []).slice(0, leaderboardLimit);
  updateLeaderboardSubmissionState();
  leaderboardStatus.textContent = "Daily challenge times for today. Lowest time wins.";
  leaderboardName.value = readJson(leaderboardNameKey, { value: "" }).value || "";
  renderLeaderboard();
}

function submitLeaderboard(event) {
  event.preventDefault();

  if (!(game.mode === "daily" && game.won && !game.leaderboardSubmitted)) {
    return;
  }

  const name = leaderboardName.value.trim().slice(0, 18);
  if (!name) {
    leaderboardStatus.textContent = "Enter a name before submitting.";
    leaderboardName.focus();
    return;
  }

  const data = leaderboardData();
  const entries = Array.isArray(data[game.dailyKey]) ? data[game.dailyKey] : [];
  const nextEntry = {
    name,
    score: game.score,
    completedAt: new Date().toISOString()
  };

  data[game.dailyKey] = sortLeaderboard([
    ...entries.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()),
    nextEntry
  ]).slice(0, leaderboardLimit);

  saveLeaderboardData(data);
  writeJson(leaderboardNameKey, { value: name });

  const submitted = readJson(leaderboardSubmitKey, {});
  submitted[game.dailyKey] = true;
  writeJson(leaderboardSubmitKey, submitted);

  leaderboardStatus.textContent = "Score submitted. You're on today's board.";
  refreshLeaderboard();
}

randomButton.addEventListener("click", () => {
  startMode("random");
});

pcButton.addEventListener("click", () => {
  chooseDeviceMode("pc");
});

mobileButton.addEventListener("click", () => {
  chooseDeviceMode("mobile");
});

dailyButton.addEventListener("click", () => {
  startMode("daily");
});

shiftButton.addEventListener("click", () => {
  startMode("shift");
});

menuButton.addEventListener("click", () => {
  returnToMenu();
});

winMenuButton.addEventListener("click", () => {
  returnToMenu();
});

replayButton.addEventListener("click", () => {
  replayMode();
});

refreshBoardButton.addEventListener("click", () => {
  refreshLeaderboard();
});

leaderboardForm.addEventListener("submit", submitLeaderboard);

window.addEventListener("keydown", handleKeyDown, { passive: false });
window.addEventListener("keyup", handleKeyUp, { passive: false });
canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

refreshLeaderboard();
updateControlCopy();
returnToMenu();
requestAnimationFrame(gameFrame);
