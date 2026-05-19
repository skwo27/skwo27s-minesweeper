"use client";

import { useEffect, useMemo, useState } from "react";

type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

type Status = "ready" | "playing" | "won" | "lost";
type Difficulty = {
  label: string;
  width: number;
  height: number;
  mines: number;
};

const DIFFICULTIES: Difficulty[] = [
  { label: "입문", width: 9, height: 9, mines: 10 },
  { label: "보통", width: 12, height: 10, mines: 18 },
  { label: "도전", width: 16, height: 12, mines: 36 },
];

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

export default function Home() {
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const [board, setBoard] = useState(() => createEmptyBoard(DIFFICULTIES[0]));
  const [status, setStatus] = useState<Status>("ready");
  const [magnifiers, setMagnifiers] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showHints, setShowHints] = useState(false);
  const [lastStuckSignature, setLastStuckSignature] = useState("");
  const [message, setMessage] = useState("첫 칸은 언제나 안전합니다.");

  const logic = useMemo(() => getLogicState(board, difficulty), [board, difficulty]);
  const remainingMines = difficulty.mines - board.filter((cell) => cell.flagged).length;
  const revealedSafeCells = countRevealedSafeCells(board);
  const totalSafeCells = board.length - difficulty.mines;
  const faceClass = status === "lost" ? "lost" : status === "won" ? "won" : "ready";

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    const timerId = window.setInterval(() => {
      setElapsedSeconds((seconds) => Math.min(999, seconds + 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [status]);

  const checkWin = (nextBoard: Cell[]) => {
    if (countRevealedSafeCells(nextBoard) === totalSafeCells) {
      setStatus("won");
      setMessage("모든 안전한 칸을 열었습니다. 찍기 없이 승리!");
      return true;
    }

    return false;
  };

  const maybeGrantMagnifier = (nextBoard: Cell[]) => {
    const nextLogic = getLogicState(nextBoard, difficulty);
    const signature = boardSignature(nextBoard);

    if (status !== "lost" && nextLogic.isStuck && signature !== lastStuckSignature) {
      setMagnifiers((count) => count + 1);
      setLastStuckSignature(signature);
      setMessage("논리로 확정할 수 있는 칸이 없습니다. 돋보기 1개를 지급했습니다.");
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
    setMagnifiers(0);
    setElapsedSeconds(0);
    setLastStuckSignature("");
    setMessage("첫 칸은 언제나 안전합니다.");
  };

  const revealCell = (index: number) => {
    if (status === "lost" || status === "won" || board[index].flagged || board[index].revealed) {
      return;
    }

    const activeBoard = status === "ready" ? buildBoard(difficulty, index) : board;
    const clickedCell = activeBoard[index];
    setStatus("playing");

    if (clickedCell.mine) {
      const lostBoard = revealAllMines(activeBoard);
      setBoard(lostBoard);
      setStatus("lost");
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
    maybeGrantMagnifier(nextBoard);
  };

  const useMagnifier = () => {
    if (magnifiers <= 0 || status !== "playing") {
      return;
    }

    const candidates = board
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !cell.revealed && !cell.flagged && !cell.mine);

    if (candidates.length === 0) {
      return;
    }

    const safestKnownMove = [...logic.safeMoves].find((index) => !board[index].flagged);
    const targetIndex =
      safestKnownMove ?? candidates[Math.floor(Math.random() * candidates.length)].index;
    const nextBoard = revealFrom(board, targetIndex, difficulty);

    setMagnifiers((count) => count - 1);
    setBoard(nextBoard);
    setMessage("돋보기로 안전한 칸 하나를 확인했습니다.");

    if (!checkWin(nextBoard)) {
      const nextLogic = getLogicState(nextBoard, difficulty);
      if (nextLogic.safeMoves.size > 0 || nextLogic.mineMoves.size > 0) {
        setMessage("돋보기로 길이 열렸습니다. 다시 논리로 이어가세요.");
        return;
      }

      maybeGrantMagnifier(nextBoard);
    }
  };

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
          <div className="difficulty-tabs" aria-label="난이도 선택">
            {DIFFICULTIES.map((item) => (
              <button
                className={item.label === difficulty.label ? "active" : ""}
                key={item.label}
                onClick={() => resetGame(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="magnifier-button"
            disabled={magnifiers === 0 || status !== "playing"}
            onClick={useMagnifier}
          >
            돋보기 사용 ({magnifiers})
          </button>
          <label className="hint-toggle">
            <input
              checked={showHints}
              onChange={(event) => setShowHints(event.target.checked)}
              type="checkbox"
            />
            <span>힌트 표시</span>
          </label>
          <p>
            {revealedSafeCells}/{totalSafeCells} · {message}
          </p>
        </div>

        <div
          className="mine-board"
          style={{
            gridTemplateColumns: `repeat(${difficulty.width}, minmax(0, 1fr))`,
          }}
        >
          {board.map((cell, index) => {
            const isHintSafe = showHints && logic.safeMoves.has(index) && !cell.revealed;
            const isHintMine = showHints && logic.mineMoves.has(index) && !cell.revealed;
            const label = cell.revealed
              ? cell.mine
                ? "●"
                : cell.adjacent || ""
              : cell.flagged
                ? "⚑"
                : "";

            return (
              <button
                aria-label={`${index + 1}번 칸`}
                className={[
                  "cell",
                  cell.revealed ? "revealed" : "",
                  cell.flagged ? "flagged" : "",
                  cell.mine && cell.revealed ? "mine" : "",
                  isHintSafe ? "hint-safe" : "",
                  isHintMine ? "hint-mine" : "",
                ].join(" ")}
                data-value={cell.revealed && !cell.mine && cell.adjacent > 0 ? cell.adjacent : ""}
                key={index}
                onClick={() => revealCell(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  toggleFlag(index);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <p className="rule-note">
          우클릭으로 깃발을 꽂습니다. 확정 가능한 안전 칸이나 지뢰가 없을 때만 돋보기가
          지급됩니다.
        </p>
      </div>
    </section>
  );
}
