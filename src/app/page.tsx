"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

type Status = "ready" | "playing" | "won" | "lost";
type ScanResult = "safe" | "mine";
type ToolMode = "main" | "difficulty" | "custom";
type Difficulty = {
  label: string;
  width: number;
  height: number;
  mines: number;
};

const DIFFICULTIES: Difficulty[] = [
  { label: "쉬움", width: 9, height: 9, mines: 10 },
  { label: "보통", width: 14, height: 14, mines: 30 },
  { label: "도전", width: 22, height: 22, mines: 100 },
];

const CUSTOM_MIN_SIZE = 5;
const CUSTOM_MAX_WIDTH = 30;

const DIRECTIONS = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].map((dx) => ({ dx, dy })),
).filter(({ dx, dy }) => dx !== 0 || dy !== 0);

const createEmptyBoard = ({ width, height }: Difficulty): Cell[] =>
  Array.from({ length: width * height }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    adjacent: 0,
  }));

const getNeighbors = (index: number, width: number, height: number) => {
  const x = index % width;
  const y = Math.floor(index / width);

  return DIRECTIONS.map(({ dx, dy }) => ({ x: x + dx, y: y + dy }))
    .filter(({ x: nx, y: ny }) => nx >= 0 && nx < width && ny >= 0 && ny < height)
    .map(({ x: nx, y: ny }) => ny * width + nx);
};

const buildBoard = (difficulty: Difficulty, firstIndex: number): Cell[] => {
  const board = createEmptyBoard(difficulty);
  const safeZone = new Set([
    firstIndex,
    ...getNeighbors(firstIndex, difficulty.width, difficulty.height),
  ]);
  const candidates = board
    .map((_, index) => index)
    .filter((index) => !safeZone.has(index));

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[randomIndex]] = [candidates[randomIndex], candidates[i]];
  }

  candidates.slice(0, difficulty.mines).forEach((index) => {
    board[index].mine = true;
  });

  return board.map((cell, index) => ({
    ...cell,
    adjacent: getNeighbors(index, difficulty.width, difficulty.height).filter(
      (neighbor) => board[neighbor].mine,
    ).length,
  }));
};

const revealFrom = (board: Cell[], startIndex: number, difficulty: Difficulty): Cell[] => {
  const next = board.map((cell) => ({ ...cell }));
  const queue = [startIndex];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const index = queue.shift();
    if (index === undefined || visited.has(index)) {
      continue;
    }

    visited.add(index);
    const cell = next[index];
    if (cell.flagged || cell.revealed) {
      continue;
    }

    cell.revealed = true;
    if (cell.adjacent === 0 && !cell.mine) {
      getNeighbors(index, difficulty.width, difficulty.height).forEach((neighbor) => {
        if (!next[neighbor].revealed && !next[neighbor].flagged) {
          queue.push(neighbor);
        }
      });
    }
  }

  return next;
};

const revealAllMines = (board: Cell[]): Cell[] =>
  board.map((cell) => (cell.mine ? { ...cell, revealed: true } : { ...cell }));

const getLogicState = (board: Cell[], difficulty: Difficulty) => {
  const safeMoves = new Set<number>();
  const mineMoves = new Set<number>();

  board.forEach((cell, index) => {
    if (!cell.revealed || cell.adjacent === 0 || cell.mine) {
      return;
    }

    const neighbors = getNeighbors(index, difficulty.width, difficulty.height);
    const hidden = neighbors.filter((neighbor) => {
      const neighborCell = board[neighbor];
      return !neighborCell.revealed && !neighborCell.flagged;
    });
    const flagged = neighbors.filter((neighbor) => board[neighbor].flagged).length;
    const remainingMines = cell.adjacent - flagged;

    if (hidden.length === 0 || remainingMines < 0) {
      return;
    }

    if (remainingMines === 0) {
      hidden.forEach((neighbor) => safeMoves.add(neighbor));
    }

    if (remainingMines === hidden.length) {
      hidden.forEach((neighbor) => mineMoves.add(neighbor));
    }
  });

  const hiddenSafeCells = board
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => !cell.revealed && !cell.flagged && !cell.mine)
    .map(({ index }) => index);

  return {
    safeMoves,
    mineMoves,
    isStuck:
      hiddenSafeCells.length > 0 &&
      safeMoves.size === 0 &&
      mineMoves.size === 0 &&
      board.some((cell) => cell.revealed),
  };
};

const boardSignature = (board: Cell[]) =>
  board
    .map((cell) => {
      if (cell.revealed) return "r";
      if (cell.flagged) return "f";
      return "h";
    })
    .join("");

const countRevealedSafeCells = (board: Cell[]) =>
  board.filter((cell) => cell.revealed && !cell.mine).length;

const formatCounter = (value: number) =>
  Math.max(-99, Math.min(999, value)).toString().padStart(3, "0");

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseCustomSize = (value: string, max: number) => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return CUSTOM_MIN_SIZE;
  }

  return clamp(parsed, CUSTOM_MIN_SIZE, max);
};

const parseCustomHeight = (value: string) => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return CUSTOM_MIN_SIZE;
  }

  return Math.max(CUSTOM_MIN_SIZE, parsed);
};

const getMaxCustomMines = (width: number, height: number) =>
  Math.max(1, width * height - 9);

const parseCustomMines = (value: string) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
};

const getCustomMineValidationMessage = (value: string, max: number) => {
  const mines = parseCustomMines(value);

  if (mines === null) {
    return `지뢰는 1~${max}개 사이의 정수로 입력하세요.`;
  }

  if (mines < 1 || mines > max) {
    return `지뢰는 1~${max}개 사이로 입력하세요.`;
  }

  return "";
};

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

const createCustomDifficulty = (width: number, height: number, mines: number): Difficulty => ({
  label: "사용자",
  width,
  height,
  mines,
});

export default function Home() {
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const [board, setBoard] = useState(() => createEmptyBoard(DIFFICULTIES[0]));
  const [status, setStatus] = useState<Status>("ready");
  const [hasMagnifier, setHasMagnifier] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scanMode, setScanMode] = useState(false);
  const [scannedCells, setScannedCells] = useState<Record<number, ScanResult>>({});
  const [showHints, setShowHints] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>("main");
  const [customWidthInput, setCustomWidthInput] = useState(String(DIFFICULTIES[0].width));
  const [customHeightInput, setCustomHeightInput] = useState(String(DIFFICULTIES[0].height));
  const [customMinesInput, setCustomMinesInput] = useState(String(DIFFICULTIES[0].mines));
  const [lastStuckSignature, setLastStuckSignature] = useState("");
  const [message, setMessage] = useState("첫 칸은 언제나 안전합니다.");
  const longPressTimerRef = useRef<number | null>(null);
  const longPressHandledRef = useRef(false);
  const shortcutActionsRef = useRef<(() => void)[]>([]);
  const backShortcutActionRef = useRef<(() => void) | null>(null);

  const logic = useMemo(() => getLogicState(board, difficulty), [board, difficulty]);
  const magnifierTargets = useMemo(() => {
    const targets = new Set<number>();

    board.forEach((cell, index) => {
      if (cell.revealed || cell.flagged) {
        return;
      }

      const isNextToRevealedCell = getNeighbors(index, difficulty.width, difficulty.height).some(
        (neighbor) => board[neighbor].revealed,
      );

      if (isNextToRevealedCell) {
        targets.add(index);
      }
    });

    return targets;
  }, [board, difficulty]);
  const remainingMines = difficulty.mines - board.filter((cell) => cell.flagged).length;
  const revealedSafeCells = countRevealedSafeCells(board);
  const totalSafeCells = board.length - difficulty.mines;
  const faceClass = status === "lost" ? "lost" : status === "won" ? "won" : "ready";
  const largestBoardSide = Math.max(difficulty.width, difficulty.height);
  const boardDensityClass =
    largestBoardSide >= 20 ? "dense-board" : largestBoardSide >= 14 ? "medium-board" : "";
  const customMineLimit = getMaxCustomMines(
    parseCustomSize(customWidthInput, CUSTOM_MAX_WIDTH),
    parseCustomHeight(customHeightInput),
  );
  const customMineValidationMessage = getCustomMineValidationMessage(
    customMinesInput,
    customMineLimit,
  );
  const toolMessage =
    toolMode === "custom"
      ? customMineValidationMessage ||
        `열 ${CUSTOM_MIN_SIZE}~${CUSTOM_MAX_WIDTH}개 · 행 ${CUSTOM_MIN_SIZE}개 이상 · 지뢰 1~${customMineLimit}개`
      : toolMode === "difficulty"
        ? "난이도를 변경하면 현재 게임 진행사항이 초기화됩니다."
      : `${revealedSafeCells}/${totalSafeCells} · ${message}`;

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    const timerId = window.setInterval(() => {
      setElapsedSeconds((seconds) => Math.min(999, seconds + 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [status]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const checkWin = (nextBoard: Cell[]) => {
    if (countRevealedSafeCells(nextBoard) === totalSafeCells) {
      setStatus("won");
      setScanMode(false);
      setMessage("모든 안전한 칸을 열었습니다. 찍기 없이 승리!");
      return true;
    }

    return false;
  };

  const maybeGrantMagnifier = (nextBoard: Cell[]) => {
    const nextLogic = getLogicState(nextBoard, difficulty);
    const signature = boardSignature(nextBoard);

    if (
      status !== "lost" &&
      !hasMagnifier &&
      nextLogic.isStuck &&
      signature !== lastStuckSignature
    ) {
      setHasMagnifier(true);
      setLastStuckSignature(signature);
      setMessage("논리로 확정할 수 있는 칸이 없습니다. 돋보기를 사용할 수 있습니다.");
      return;
    }

    if (nextLogic.safeMoves.size > 0 || nextLogic.mineMoves.size > 0) {
      setMessage("확정 가능한 수가 남아 있습니다. 숫자 주변을 살펴보세요.");
      return;
    }

    if (status === "ready") {
      setMessage("첫 칸은 언제나 안전합니다.");
    }
  };

  const resetGame = (nextDifficulty = difficulty) => {
    setDifficulty(nextDifficulty);
    setBoard(createEmptyBoard(nextDifficulty));
    setStatus("ready");
    setHasMagnifier(false);
    setElapsedSeconds(0);
    setScanMode(false);
    setToolMode("main");
    setScannedCells({});
    setLastStuckSignature("");
    setMessage("첫 칸은 언제나 안전합니다.");
  };

  const startLongPressFlag = (index: number) => {
    clearLongPressTimer();
    longPressHandledRef.current = false;

    if (
      scanMode ||
      status === "lost" ||
      status === "won" ||
      status === "ready" ||
      board[index].revealed
    ) {
      return;
    }

    longPressTimerRef.current = window.setTimeout(() => {
      longPressHandledRef.current = true;
      longPressTimerRef.current = null;
      toggleFlag(index);
    }, 550);
  };

  const releaseLongPressFlag = () => {
    clearLongPressTimer();

    if (longPressHandledRef.current) {
      window.setTimeout(() => {
        longPressHandledRef.current = false;
      }, 250);
    }
  };

  const revealCell = (index: number) => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }

    if (status === "lost" || status === "won" || board[index].flagged || board[index].revealed) {
      return;
    }

    if (scanMode && status === "playing") {
      if (!magnifierTargets.has(index)) {
        setMessage("돋보기는 열린 칸과 맞닿은 닫힌 칸에만 사용할 수 있습니다.");
        return;
      }

      const result: ScanResult = board[index].mine ? "mine" : "safe";

      setScannedCells((current) => ({ ...current, [index]: result }));
      setHasMagnifier(false);
      setScanMode(false);
      setMessage(
        result === "mine"
          ? "돋보기가 알려줬습니다. 선택한 칸은 지뢰입니다."
          : "돋보기가 알려줬습니다. 선택한 칸은 안전합니다.",
      );
      return;
    }

    const activeBoard = status === "ready" ? buildBoard(difficulty, index) : board;
    const clickedCell = activeBoard[index];
    setStatus("playing");

    if (clickedCell.mine) {
      const lostBoard = revealAllMines(activeBoard);
      setBoard(lostBoard);
      setStatus("lost");
      setScanMode(false);
      setMessage("지뢰를 밟았습니다. 새 판으로 다시 도전하세요.");
      return;
    }

    const nextBoard = revealFrom(activeBoard, index, difficulty);
    setBoard(nextBoard);

    if (!checkWin(nextBoard)) {
      maybeGrantMagnifier(nextBoard);
    }
  };

  const toggleFlag = (index: number) => {
    if (status === "lost" || status === "won" || status === "ready" || board[index].revealed) {
      return;
    }

    const nextBoard = board.map((cell, cellIndex) =>
      cellIndex === index ? { ...cell, flagged: !cell.flagged } : cell,
    );
    setBoard(nextBoard);
  };

  const useMagnifier = () => {
    if (!hasMagnifier || status !== "playing") {
      return;
    }

    if (scanMode) {
      setScanMode(false);
      setMessage("돋보기 선택 모드를 취소했습니다.");
      return;
    }

    if (magnifierTargets.size === 0) {
      setMessage("돋보기를 사용할 수 있는 인접 칸이 없습니다.");
      return;
    }

    setScanMode(true);
    setMessage("돋보기를 쓸 칸을 하나 선택하세요.");
  };

  const selectDifficulty = (nextDifficulty: Difficulty) => {
    if (nextDifficulty.label === difficulty.label) {
      setToolMode("main");
      return;
    }

    resetGame(nextDifficulty);
  };

  const openCustomSettings = () => {
    setCustomWidthInput(String(difficulty.width));
    setCustomHeightInput(String(difficulty.height));
    setCustomMinesInput(String(difficulty.mines));
    setToolMode("custom");
  };

  const applyCustomDifficulty = () => {
    const width = parseCustomSize(customWidthInput, CUSTOM_MAX_WIDTH);
    const height = parseCustomHeight(customHeightInput);
    const mineLimit = getMaxCustomMines(width, height);
    const mineValidationMessage = getCustomMineValidationMessage(customMinesInput, mineLimit);

    setCustomWidthInput(String(width));
    setCustomHeightInput(String(height));

    if (mineValidationMessage) {
      setMessage(mineValidationMessage);
      return;
    }

    const mines = parseCustomMines(customMinesInput);

    if (mines === null) {
      return;
    }

    setCustomMinesInput(String(mines));
    resetGame(createCustomDifficulty(width, height, mines));
  };

  const applyCustomDifficultyOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    applyCustomDifficulty();
  };

  useEffect(() => {
    shortcutActionsRef.current =
      toolMode === "custom"
        ? []
        : toolMode === "difficulty"
          ? [
              () => selectDifficulty(DIFFICULTIES[0]),
              () => selectDifficulty(DIFFICULTIES[1]),
              () => selectDifficulty(DIFFICULTIES[2]),
              openCustomSettings,
            ]
          : [
              () => setToolMode("difficulty"),
              useMagnifier,
              () => setShowHints((current) => !current),
            ];
    backShortcutActionRef.current =
      toolMode === "custom"
        ? () => setToolMode("difficulty")
        : toolMode === "difficulty"
          ? () => setToolMode("main")
          : null;
  });

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      if (event.key === "Backspace") {
        const backAction = backShortcutActionRef.current;

        if (!backAction) {
          return;
        }

        event.preventDefault();
        backAction();
        return;
      }

      const shortcutIndex = Number.parseInt(event.key, 10) - 1;

      if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0) {
        return;
      }

      const action = shortcutActionsRef.current[shortcutIndex];

      if (!action) {
        return;
      }

      event.preventDefault();
      action();
    };

    window.addEventListener("keydown", handleShortcut);

    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const toolActionsClassName = [
    "tool-actions",
    toolMode === "difficulty" ? "difficulty-mode" : "",
    toolMode === "custom" ? "custom-mode" : "",
  ].join(" ");

  return (
    <section className="game-shell">
      <div className="game-panel">
        <div className="game-topbar">
          <div className="digital-counter" aria-label={`남은 지뢰 ${remainingMines}`}>
            {formatCounter(remainingMines)}
          </div>
          <button className="face-button" aria-label="새 판" onClick={() => resetGame()}>
            <span className={`face-icon ${faceClass}`} aria-hidden="true" />
          </button>
          <div className="digital-counter" aria-label={`경과 시간 ${elapsedSeconds}초`}>
            {formatCounter(elapsedSeconds)}
          </div>
        </div>

        <div className="tool-row">
          <div
            className={toolActionsClassName}
            aria-label={
              toolMode === "main"
                ? "게임 도구"
                : toolMode === "custom"
                  ? "사용자 난이도 설정"
                  : "난이도 선택"
            }
          >
            {toolMode === "difficulty" ? (
              <>
                {DIFFICULTIES.map((item) => (
                  <button
                    aria-current={item.label === difficulty.label ? "true" : undefined}
                    className={item.label === difficulty.label ? "active" : ""}
                    key={item.label}
                    onClick={() => selectDifficulty(item)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  className={difficulty.label === "사용자" ? "active" : ""}
                  onClick={openCustomSettings}
                  type="button"
                >
                  사용자 설정
                </button>
              </>
            ) : toolMode === "custom" ? (
              <>
                <label className="custom-size-field">
                  <span>열</span>
                  <input
                    aria-label="열 크기"
                    inputMode="numeric"
                    max={CUSTOM_MAX_WIDTH}
                    min={CUSTOM_MIN_SIZE}
                    onChange={(event) => setCustomWidthInput(event.target.value)}
                    onKeyDown={applyCustomDifficultyOnEnter}
                    type="number"
                    value={customWidthInput}
                  />
                </label>
                <label className="custom-size-field">
                  <span>행</span>
                  <input
                    aria-label="행 크기"
                    inputMode="numeric"
                    min={CUSTOM_MIN_SIZE}
                    onChange={(event) => setCustomHeightInput(event.target.value)}
                    onKeyDown={applyCustomDifficultyOnEnter}
                    type="number"
                    value={customHeightInput}
                  />
                </label>
                <label className="custom-size-field">
                  <span>지뢰</span>
                  <input
                    aria-label="지뢰 수"
                    inputMode="numeric"
                    max={customMineLimit}
                    min={1}
                    onChange={(event) => setCustomMinesInput(event.target.value)}
                    onKeyDown={applyCustomDifficultyOnEnter}
                    type="number"
                    value={customMinesInput}
                  />
                </label>
                <button onClick={applyCustomDifficulty} type="button">
                  확인
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setToolMode("difficulty")}
                  type="button"
                >
                  난이도 설정
                </button>
                <button
                  className={scanMode ? "active" : ""}
                  disabled={!hasMagnifier || status !== "playing"}
                  onClick={useMagnifier}
                  type="button"
                >
                  돋보기 사용
                </button>
                <button
                  aria-pressed={showHints}
                  className={showHints ? "active" : ""}
                  onClick={() => setShowHints((current) => !current)}
                  type="button"
                >
                  힌트 사용
                </button>
              </>
            )}
          </div>
          <p>
            {toolMessage}
          </p>
        </div>

        <div
          className={["mine-board", boardDensityClass].filter(Boolean).join(" ")}
          style={{
            gridTemplateColumns: `repeat(${difficulty.width}, minmax(0, 1fr))`,
          }}
        >
          {board.map((cell, index) => {
            const isHintSafe = showHints && logic.safeMoves.has(index) && !cell.revealed;
            const isHintMine = showHints && logic.mineMoves.has(index) && !cell.revealed;
            const scanResult = scannedCells[index];
            const label = cell.revealed
              ? cell.mine
                ? "●"
                : cell.adjacent || ""
              : cell.flagged
                ? "⚑"
                : scanResult === "mine"
                  ? "지"
                  : scanResult === "safe"
                    ? "안"
                : "";

            return (
              <button
                aria-label={`${index + 1}번 칸`}
                className={[
                  "cell",
                  cell.revealed ? "revealed" : "",
                  cell.flagged ? "flagged" : "",
                  cell.mine && cell.revealed ? "mine" : "",
                  scanResult ? `scanned-${scanResult}` : "",
                  scanMode && magnifierTargets.has(index) ? "scan-target" : "",
                  isHintSafe ? "hint-safe" : "",
                  isHintMine ? "hint-mine" : "",
                ].join(" ")}
                data-value={cell.revealed && !cell.mine && cell.adjacent > 0 ? cell.adjacent : ""}
                key={index}
                onClick={() => revealCell(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (longPressHandledRef.current) {
                    return;
                  }

                  toggleFlag(index);
                }}
                onPointerCancel={releaseLongPressFlag}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse") {
                    return;
                  }

                  startLongPressFlag(index);
                }}
                onPointerLeave={releaseLongPressFlag}
                onPointerUp={releaseLongPressFlag}
              >
                {label}
              </button>
            );
          })}
        </div>

        <p className="rule-note">
          <span className="desktop-note">우클릭으로 깃발을 꽂습니다.</span>
          <span className="mobile-note">길게 누르기로 깃발을 꽂습니다.</span>
          {" "}확정 가능한 안전 칸이나 지뢰가 없을 때만 돋보기가 지급되며, 돋보기는
          선택한 칸의 지뢰 여부를 알려줍니다.
        </p>
      </div>
    </section>
  );
}
