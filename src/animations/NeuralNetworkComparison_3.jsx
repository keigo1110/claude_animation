import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/** 一覧用メタ */
export const animationMeta = {
  id: "neural-3",
  label: "Feedbackで連想記憶：反復更新→energy低下→谷へ収束",
};

// ===== tiny helpers =====
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

function buildEnergyCurve(wells) {
  // E(s) = base + sum amp*exp(-((s-mu)^2)/(2*w^2)), amp negative => valley
  const N = 220;
  const xs = [];
  const Es = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    let E = 0.72;
    for (const w of wells) {
      const d = s - w.mu;
      const g = Math.exp(-(d * d) / (2 * w.width * w.width));
      E += w.amp * g;
    }
    xs.push(s);
    Es.push(E);
  }
  const Emin = Math.min(...Es);
  const Emax = Math.max(...Es);
  const En = Es.map((v) => (v - Emin) / (Emax - Emin + 1e-9)); // 0..1
  return { xs, En };
}

function pathFromCurve(xs, ys, x0, y0, w, h) {
  const pts = xs.map((s, i) => [x0 + s * w, y0 + ys[i] * h]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
  return d;
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function PixelGrid({ x, y, cell, grid, label, accent = "rgba(255,220,180,1)", glow = 0 }) {
  const n = grid.length; // rows
  const m = grid[0].length; // cols
  return (
    <g>
      {label && (
        <text x={x + (m * cell) / 2} y={y - 12} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="13">
          {label}
        </text>
      )}
      <rect
        x={x - 10}
        y={y - 10}
        width={m * cell + 20}
        height={n * cell + 20}
        rx="14"
        fill="rgba(255,255,255,0.04)"
        stroke={`rgba(255,255,255,${0.12 + 0.30 * glow})`}
        strokeWidth={1.2 + 1.2 * glow}
        filter={glow > 0.5 ? "url(#glow)" : "none"}
      />
      {grid.map((row, r) =>
        row.map((v, c) => (
          <rect
            key={`${r}-${c}`}
            x={x + c * cell}
            y={y + r * cell}
            width={cell - 2}
            height={cell - 2}
            rx="4"
            fill={accent}
            opacity={clamp(v)}
          />
        ))
      )}
    </g>
  );
}

export default function FeedbackAssociativeMemoryClean() {
  // ===== playback =====
  const STEPS = 9; // 0..8
  const INTERVAL = 720;

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState("negative");
  const timerRef = useRef(null);
  const feedbackRafRef = useRef(null);
  const feedbackStartRef = useRef(0);
  const [feedbackPhase, setFeedbackPhase] = useState(0);

  const resetDemo = useCallback(() => {
    setStep(0);
    setHasFinished(false);
  }, []);

  const start = useCallback(() => {
    resetDemo();
    setIsPlaying(true);
  }, [resetDemo]);

  useEffect(() => {
    if (!isPlaying) return;
    timerRef.current = setInterval(() => {
      setStep((s) => {
        const nx = s + 1;
        if (nx >= STEPS) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setIsPlaying(false);
          setHasFinished(true);
          return STEPS - 1;
        }
        return nx;
      });
    }, INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setFeedbackPhase(hasFinished ? 1 : 0);
      if (feedbackRafRef.current) cancelAnimationFrame(feedbackRafRef.current);
      feedbackRafRef.current = null;
      return;
    }

    feedbackStartRef.current = performance.now();
    const tick = (now) => {
      const elapsed = now - feedbackStartRef.current;
      const phase = clamp(elapsed / INTERVAL, 0, 1);
      setFeedbackPhase(phase);
      if (phase < 1) {
        feedbackRafRef.current = requestAnimationFrame(tick);
      }
    };
    feedbackRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (feedbackRafRef.current) cancelAnimationFrame(feedbackRafRef.current);
      feedbackRafRef.current = null;
    };
  }, [isPlaying, step, hasFinished]);

  const t = step / (STEPS - 1); // 0..1

  // ===== fixed “memories” (5x5) =====
  const memories = useMemo(() => {
    // 0/1 patterns
    const A = [
      [1, 0, 0, 0, 1],
      [0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 1, 0],
      [1, 0, 0, 0, 1],
    ];
    const B = [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ];
    const C = [
      [0, 1, 1, 1, 0],
      [1, 0, 0, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
    ];
    const D = [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 0, 1, 0, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ];
    return [A, B, C, D];
  }, []);

  const targetIdx = 2; // Cに収束する
  const target = memories[targetIdx];

  // cue: targetの一部が欠けていて、1箇所だけ誤り（手がかり）
  const cue = useMemo(() => {
    const base = target.map((row) => row.slice());
    // 欠け（unknown）= 0.15 opacity に落とす（「情報がない」表現）
    const holes = [
      [0, 2],
      [1, 1],
      [1, 3],
      [3, 1],
      [3, 3],
      [4, 2],
    ];
    holes.forEach(([r, c]) => (base[r][c] = -1));
    // 1箇所だけ誤り
    base[2][2] = 0; // 本当は1
    return base;
  }, [target]);

  // stepごとに「欠けが埋まる」「誤りが正される」— 反復更新の視覚
  const stateGrid = useMemo(() => {
    // 0..1 opacity grid
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cv = cue[r][c];
        const tv = target[r][c];

        if (cv === -1) {
          // 欠け：反復で徐々に埋まる（「補完」）
          const appearStep = 2 + ((r + c) % 4); // 2..5
          const u = clamp((step - appearStep) / 3); // 0..1
          g[r][c] = tv ? lerp(0.12, 0.95, u) : lerp(0.06, 0.18, u);
        } else if (cv !== tv) {
          // 誤り：早めに訂正される（「手がかりから正しい記憶へ」）
          const u = clamp((step - 2) / 2);
          g[r][c] = lerp(cv ? 0.85 : 0.12, tv ? 0.95 : 0.12, u);
        } else {
          // もともと合ってる場所：少しずつ確信が上がる
          const u = clamp(step / 5);
          g[r][c] = tv ? lerp(0.65, 0.95, u) : 0.06;
        }
      }
    }
    return g;
  }, [cue, target, step]);

  const isPositive = mode === "positive";
  const positiveT = isPositive ? clamp((step + feedbackPhase) / (STEPS - 1), 0, 1) : 0;
  const modeLabel = isPositive ? "ポジティブフィードバック" : "ネガティブフィードバック";
  const modeDescription = isPositive
    ? "増幅が自己強化され、複数の安定点が生まれて新しいパターンが創発する"
    : "反復更新で energy が下がり、単一の谷（安定点）に収束して補完される";
  const emergentPattern = useMemo(
    () => [
      [1, 1, 0, 1, 1],
      [1, 0, 1, 0, 1],
      [0, 1, 1, 1, 0],
      [1, 0, 1, 0, 1],
      [1, 1, 0, 1, 1],
    ],
    []
  );
  const arrowPattern = useMemo(
    () => [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 0, 1, 0, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ],
    []
  );
  const targetGrid = useMemo(
    () => target.map((row) => row.map((v) => (v ? 0.95 : 0.06))),
    [target]
  );
  const arrowGrid = useMemo(
    () => arrowPattern.map((row) => row.map((v) => (v ? 0.98 : 0.04))),
    [arrowPattern]
  );
  const emergentGrid = useMemo(
    () => emergentPattern.map((row) => row.map((v) => (v ? 0.98 : 0.04))),
    [emergentPattern]
  );
  const stateDisplayGrid = useMemo(() => {
    if (!isPositive) return stateGrid;
    const s = step + feedbackPhase; // continuous iteration
    if (s <= 2) {
      const u = clamp(s / 2, 0, 1);
      return stateGrid.map((row, r) =>
        row.map((v, c) => lerp(v, targetGrid[r][c], u))
      );
    }
    if (s <= 5) {
      const u = clamp((s - 2) / 3, 0, 1);
      return targetGrid.map((row, r) =>
        row.map((v, c) => lerp(v, arrowGrid[r][c], u))
      );
    }
    const u = clamp((s - 5) / 3, 0, 1);
    return arrowGrid.map((row, r) =>
      row.map((v, c) => lerp(v, emergentGrid[r][c], u))
    );
  }, [isPositive, stateGrid, targetGrid, arrowGrid, emergentGrid, step, feedbackPhase]);
  const memoryIcons = useMemo(() => {
    if (!isPositive) return memories;
    return [...memories, emergentPattern];
  }, [isPositive, memories, emergentPattern]);
  const emergentMemoryGrid = useMemo(() => {
    if (!isPositive) {
      return target.map((row) => row.map((v) => (v ? 0.95 : 0.06)));
    }
    const ease = clamp(positiveT * positiveT * 1.15, 0, 1);
    return target.map((row, r) =>
      row.map((v, c) => {
        const base = v ? 0.95 : 0.06;
        const em = emergentPattern[r][c] ? 0.98 : 0.04;
        return lerp(base, em, ease);
      })
    );
  }, [isPositive, target, emergentPattern, positiveT]);

  // ===== energy landscape (no waves, no jitter) =====
  const wells = useMemo(
    () => [
      { mu: 0.18, width: 0.055, amp: -0.55 },
      { mu: 0.42, width: 0.055, amp: -0.60 },
      { mu: 0.68, width: 0.050, amp: -0.85 }, // target valley
      { mu: 0.86, width: 0.060, amp: -0.52 },
    ],
    []
  );

  const energyWells = useMemo(() => {
    const phase = isPlaying ? feedbackPhase : 0;
    const base = wells.map((w, i) => {
      const drift = 0.003 * Math.sin(0.75 * step + i * 1.3 + phase * Math.PI * 1.5);
      const ampShift = 1 + 0.022 * Math.sin(0.55 * step + i * 1.7 + phase * Math.PI);
      const widthShift = 1 + 0.02 * Math.cos(0.45 * step + i * 1.1 - phase * Math.PI);
      return {
        mu: w.mu + drift,
        width: w.width * widthShift,
        amp: w.amp * ampShift,
      };
    });

    if (!isPositive) return base;

    const spread = positiveT;
    const amplified = base.map((w, i) => {
      const widen = 1 + 0.25 * spread;
      const flatten = 1 - (i === 3 ? 0.05 : 0.20) * spread;
      const shift = 0.006 * Math.sin(step * 0.5 + i);
      return {
        mu: w.mu + shift,
        width: w.width * (i === 3 ? 0.85 : widen),
        amp: w.amp * flatten,
      };
    });
    const emergent = [{ mu: 0.98, width: 0.045, amp: -1.20 * spread }];
    return [...amplified, ...emergent];
  }, [wells, step, feedbackPhase, isPlaying, isPositive, positiveT]);

  const curve = useMemo(() => buildEnergyCurve(energyWells), [energyWells]);
  // 表示用: 谷を下・山を上にする（En は低E=小→谷なので、1-En で y は下が正の SVG で谷が下に）
  const EnDisplay = useMemo(() => curve.En.map((e) => 1 - e), [curve.En]);

  const W = 960;
  const H = 670;

  const gridCell = 20;
  const gridY = 150;
  const cueX = 120;
  const stateX = 430;
  const memoryX = 740;
  const gridSize = gridCell * 5 + 20;
  const arrowY = gridY + 40;
  const cueRight = cueX + gridCell * 5 + 10;
  const stateLeft = stateX - 10;
  const stateRight = stateX + gridCell * 5 + 10;
  const memoryLeft = memoryX - 10;

  const energyBox = { x: 50, y: 370, w: 864, h: 220 };
  const energyTopPad = 20;
  const energyH = energyBox.h - energyTopPad - 30;
  const energyXAxisOffset = 50; // x軸（横線・ラベル）だけを下にずらす量（px）
  const energyAxisGap = 8; // 軸とグラフ線の隙間（px）

  const pathD = useMemo(
    () =>
      pathFromCurve(
        curve.xs,
        EnDisplay,
        energyBox.x + energyAxisGap,
        energyBox.y + energyTopPad,
        energyBox.w - energyAxisGap,
        energyH - energyAxisGap
      ),
    [curve.xs, EnDisplay, energyBox.x, energyBox.y, energyBox.w, energyH, energyAxisGap]
  );

  // ball moves monotonically along one valley side: s(t) from 0.58 -> 0.68
  const s0 = 0.58;
  const s1 = 0.68;
  const s1Positive = 0.98;
  const sNow = lerp(s0, isPositive ? s1Positive : s1, t);

  const ballXY = useMemo(() => {
    const idx = Math.round(sNow * 220);
    const x = energyBox.x + energyAxisGap + sNow * (energyBox.w - energyAxisGap);
    const y =
      energyBox.y +
      energyTopPad +
      EnDisplay[clamp(idx, 0, EnDisplay.length - 1)] * (energyH - energyAxisGap);
    return { x, y };
  }, [sNow, EnDisplay, energyBox.x, energyBox.y, energyBox.w, energyH, energyAxisGap]);

  const valleyDots = useMemo(() => {
    return energyWells.map((w) => {
      const idx = Math.round(w.mu * 220);
      const x = energyBox.x + energyAxisGap + w.mu * (energyBox.w - energyAxisGap);
      const y =
        energyBox.y +
        energyTopPad +
        EnDisplay[clamp(idx, 0, EnDisplay.length - 1)] * (energyH - energyAxisGap);
      return { x, y };
    });
  }, [energyWells, EnDisplay, energyBox.x, energyBox.y, energyBox.w, energyH, energyAxisGap]);

  const loopPulse = isPlaying ? 0.35 + 0.65 * (step % 2) : 0.35;
  const feedbackLoop = useMemo(() => {
    const cx = stateX + (gridCell * 5) / 2;
    const cy = gridY + (gridCell * 5) / 2;
    return {
      p0: { x: cx + 70, y: cy + 10 },
      p1: { x: cx + 140, y: cy + 60 },
      p2: { x: cx + 140, y: cy + 130 },
      p3: { x: cx, y: cy + 136 },
      p4: { x: cx - 140, y: cy + 130 },
      p5: { x: cx - 140, y: cy + 60 },
      p6: { x: cx - 70, y: cy + 10 },
    };
  }, [stateX, gridY, gridCell]);
  const feedbackPathD = useMemo(
    () =>
      `M ${feedbackLoop.p0.x} ${feedbackLoop.p0.y} ` +
      `C ${feedbackLoop.p1.x} ${feedbackLoop.p1.y}, ${feedbackLoop.p2.x} ${feedbackLoop.p2.y}, ${feedbackLoop.p3.x} ${feedbackLoop.p3.y} ` +
      `C ${feedbackLoop.p4.x} ${feedbackLoop.p4.y}, ${feedbackLoop.p5.x} ${feedbackLoop.p5.y}, ${feedbackLoop.p6.x} ${feedbackLoop.p6.y}`,
    [feedbackLoop]
  );
  const feedbackPointAt = useCallback(
    (s) => {
      if (s <= 0.5) {
        const u = s * 2;
        return cubicBezierPoint(feedbackLoop.p0, feedbackLoop.p1, feedbackLoop.p2, feedbackLoop.p3, u);
      }
      const u = (s - 0.5) * 2;
      return cubicBezierPoint(feedbackLoop.p3, feedbackLoop.p4, feedbackLoop.p5, feedbackLoop.p6, u);
    },
    [feedbackLoop]
  );
  const feedbackBall = useMemo(() => {
    return feedbackPointAt(feedbackPhase);
  }, [feedbackPhase, feedbackPointAt]);
  const feedbackNoisePoints = useMemo(() => {
    const seeds = [0.08, 0.16, 0.24, 0.36, 0.48, 0.62, 0.74, 0.86];
    return seeds.map((s, i) => {
      const base = feedbackPointAt(s);
      const phase = feedbackPhase * Math.PI * 2;
      const angle = 2 * Math.PI * (s + 0.12 * Math.sin(step * 0.6 + i));
      const radius = 2.2 + 1.6 * Math.sin(phase + i);
      return {
        x: base.x + radius * Math.cos(angle),
        y: base.y + radius * Math.sin(angle),
        a: 0.25 + 0.25 * Math.sin(phase + i * 1.3),
      };
    });
  }, [feedbackPointAt, feedbackPhase, step]);
  const interferenceArrow = useMemo(() => {
    const target = feedbackPointAt(0.32);
    const rawSourceX = memoryX + gridSize + 90;
    const source = { x: lerp(rawSourceX, target.x, 0.5), y: target.y };
    const phase = feedbackPhase;
    const tIn = clamp(phase, 0, 1);
    return {
      sx: source.x,
      sy: source.y,
      tx: target.x,
      ty: target.y,
      px: lerp(source.x, target.x, tIn),
      py: lerp(source.y, target.y, tIn),
      a: 0.25 + 0.55 * Math.sin(phase * Math.PI),
    };
  }, [feedbackPointAt, feedbackPhase, memoryX, gridSize, gridY]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#07070a",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        color: "rgba(255,255,255,0.86)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, width: W }}>
        <button
          onClick={start}
          disabled={isPlaying && !hasFinished}
          style={{
            background: isPlaying && !hasFinished ? "rgba(90,90,90,0.35)" : "linear-gradient(135deg, #ffb067, #ff6b3c)",
            color: "#fff",
            border: "none",
            padding: "12px 26px",
            borderRadius: 28,
            fontSize: 15,
            fontWeight: 900,
            cursor: isPlaying && !hasFinished ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: isPlaying && !hasFinished ? "none" : "0 6px 22px rgba(255,107,60,0.32)",
          }}
        >
          {isPlaying && !hasFinished ? (
            <>
              <span className="pulseDot" />
              Playing…
            </>
          ) : hasFinished ? (
            <>
              <span style={{ fontSize: 19 }}>↻</span>
              Replay
            </>
          ) : (
            <>
              <span style={{ fontSize: 19 }}>▶</span>
              Start
            </>
          )}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 4, background: "rgba(255,255,255,0.06)", borderRadius: 16 }}>
          <button
            onClick={() => setMode("negative")}
            style={{
              background: mode === "negative" ? "rgba(255,210,170,0.95)" : "transparent",
              color: mode === "negative" ? "#2a1a12" : "rgba(255,255,255,0.75)",
              border: "none",
              padding: "6px 12px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ネガティブ
          </button>
          <button
            onClick={() => setMode("positive")}
            style={{
              background: mode === "positive" ? "rgba(255,210,170,0.95)" : "transparent",
              color: mode === "positive" ? "#2a1a12" : "rgba(255,255,255,0.75)",
              border: "none",
              padding: "6px 12px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ポジティブ
          </button>
        </div>

        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.80)" }}>
          {modeDescription}
        </div>

        <div style={{ marginLeft: "auto", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          iteration: {step}/{STEPS - 1}
        </div>
      </div>

      <svg width={W} height={H} style={{ display: "block" }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="rgba(255,200,150,0.85)" />
          </marker>
          {/* フィードバック用：太め・オレンジ系で前向き矢印と差別化 */}
          <marker id="feedbackArrow" markerWidth="14" markerHeight="14" refX="12" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,8 L12,4 z" fill="rgba(255,180,100,0.95)" stroke="rgba(255,200,150,0.5)" strokeWidth="0.8" />
          </marker>
          <marker id="feedbackArrowSmall" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,180,100,0.85)" />
          </marker>
          <marker id="axisArrow" markerWidth="9" markerHeight="9" refX="7.5" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,7 L7.5,3.5 z" fill="rgba(255,255,255,0.42)" />
          </marker>
          <marker id="noiseArrow" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,8 L10,4 z" fill="rgba(255,195,135,0.98)" stroke="rgba(20,12,8,0.55)" strokeWidth="0.7" />
          </marker>
        </defs>

        {/* background card */}
        <rect x="22" y="74" width={W - 44} height={H - 96} rx="18" fill="rgba(34,18,12,0.88)" stroke="rgba(220,130,70,0.24)" />
        <text x="44" y="112" fill="rgba(255,210,170,0.95)" fontSize="15" fontWeight="900">
          {modeLabel}
        </text>

        {/* left: cue */}
        <PixelGrid x={cueX} y={gridY} cell={gridCell} grid={cue.map(row => row.map(v => (v === -1 ? 0.10 : v ? 0.85 : 0.06)))} label="外界情報" accent="rgba(255,200,150,1)" glow={0.1} />

        {/* middle: state */}
        <PixelGrid x={stateX} y={gridY} cell={gridCell} grid={stateDisplayGrid} label={step < 2 ? "状態（初期）" : "状態（反復で更新）"} accent="rgba(255,220,180,1)" glow={isPlaying ? 0.6 : hasFinished ? 0.8 : 0.2} />
        {isPositive && null}

        {/* right: converged memory */}
        <PixelGrid x={memoryX} y={gridY} cell={gridCell} grid={emergentMemoryGrid} label={isPositive ? "記憶（新パターン生成）" : "記憶（安定点）"} accent="rgba(255,240,210,1)" glow={hasFinished ? 0.9 : 0.2} />
        {isPositive && null}

        {/* arrows */}
        <line x1={cueRight} y1={arrowY} x2={stateLeft} y2={arrowY} stroke="rgba(255,200,150,0.65)" strokeWidth="2.4" markerEnd="url(#arrow)" />
        <line x1={stateRight} y1={arrowY} x2={memoryLeft} y2={arrowY} stroke={`rgba(255,220,180,${0.25 + 0.60 * t})`} strokeWidth="2.4" markerEnd="url(#arrow)" />
        {isPositive && null}

        {/* feedback loop：前向き矢印(y=190)・グリッドと重ならないようループを下に大きく取り、縁取りで視認性確保 */}
        <path
          d={feedbackPathD}
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={5.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={feedbackPathD}
          fill="none"
          stroke={`rgba(255,175,95,${0.72 + 0.26 * loopPulse})`}
          strokeWidth={3.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerStart="url(#feedbackArrowSmall)"
          markerEnd="url(#feedbackArrow)"
        />
        {/* subtle noise around feedback loop */}
        {feedbackNoisePoints.map((p, i) => (
          <circle
            key={`fb-noise-${i}`}
            cx={p.x}
            cy={p.y}
            r={2}
            fill={`rgba(255,210,150,${0.25 + 0.35 * p.a})`}
          />
        ))}
        {/* single conceptual interference arrow merging into the loop */}
        <g opacity={0.85}>
          <line
            x1={interferenceArrow.sx}
            y1={interferenceArrow.sy}
            x2={interferenceArrow.tx}
            y2={interferenceArrow.ty}
            stroke={`rgba(255,165,105,${0.35 + 0.40 * interferenceArrow.a})`}
            strokeWidth="2.4"
            markerEnd="url(#noiseArrow)"
          />
          <text
            x={interferenceArrow.sx + 10}
            y={interferenceArrow.sy - 6}
            textAnchor="start"
            fill="rgba(255,200,150,0.85)"
            fontSize="13"
            fontWeight="700"
          >
            ノイズ
          </text>
          <circle
            cx={interferenceArrow.px}
            cy={interferenceArrow.py}
            r={3.4}
            fill={`rgba(255,170,110,${0.35 + 0.45 * interferenceArrow.a})`}
          />
        </g>
        {/* feedback "information" ball */}
        <circle
          cx={feedbackBall.x}
          cy={feedbackBall.y}
          r={4.6}
          fill="rgba(255,230,190,0.95)"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.8"
          filter="url(#glow)"
        />
        <text x={480} y={306} textAnchor="middle" fill="rgba(255,235,210,0.95)" fontSize="14" fontWeight="700">
          フィードバック
        </text>

        {/* energy landscape */}
        <g>
          <text x={energyBox.x} y={energyBox.y - 5} fill="rgba(255,255,255,0.78)" fontSize="13" fontWeight="900">
            {isPositive ? "地形が広がり、新しい谷が生まれる" : "更新ごとに谷（安定点）へ"}
          </text>
          <rect
            x={energyBox.x - 20}
            y={energyBox.y - 22}
            width={energyBox.w + 36}
            height={energyBox.h + 70}
            rx="16"
            fill="rgba(0,0,0,0.18)"
            stroke="rgba(255,255,255,0.10)"
          />
          {/* axes */}
          <line
            x1={energyBox.x}
            y1={energyBox.y + energyTopPad + energyH + energyXAxisOffset}
            x2={energyBox.x}
            y2={energyBox.y + energyTopPad}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.2"
            markerEnd="url(#axisArrow)"
          />
          <line
            x1={energyBox.x}
            y1={energyBox.y + energyTopPad + energyH + energyXAxisOffset}
            x2={energyBox.x + energyBox.w}
            y2={energyBox.y + energyTopPad + energyH + energyXAxisOffset}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.2"
            markerEnd="url(#axisArrow)"
          />
          <text
            x={energyBox.x}
            y={energyBox.y + energyTopPad + energyH / 2 +27}
            textAnchor="middle"
            transform={`rotate(-90 ${energyBox.x - 34} ${energyBox.y + energyTopPad + energyH / 2})`}
            fill="rgba(255,255,255,0.55)"
            fontSize="12"
            fontWeight="700"
          >
          不安定さ
          </text>
          <text
            x={energyBox.x + energyBox.w - 36}
            y={energyBox.y + energyTopPad + energyH + 18 + energyXAxisOffset}
            fill="rgba(255,255,255,0.55)"
            fontSize="12"
            fontWeight="700"
          >
            状態
          </text>
          <path d={pathD} fill="none" stroke="rgba(255,200,150,0.44)" strokeWidth="2.2" />

          {/* 各谷の位置の下側に記憶の記号を配置（曲線と重ならないよう下にオフセット） */}
          {valleyDots.map((v, i) => {
            const m = memoryIcons[i] || memoryIcons[memoryIcons.length - 1];
            const cell = 6;
            const pad = 3;
            const box = pad * 2 + cell * 5;
            const iconOffsetY = 10;
            const ox = v.x - box / 2;
            const oy = v.y + iconOffsetY;
            return (
              <g key={i} opacity={i === targetIdx ? 1 : 0.55}>
                <rect
                  x={ox}
                  y={oy}
                  width={box}
                  height={box}
                  rx="10"
                  fill="rgba(255,255,255,0.06)"
                  stroke={i === targetIdx ? "rgba(255,220,180,0.75)" : "rgba(255,255,255,0.18)"}
                  strokeWidth={i === targetIdx ? 1.8 : 1}
                  filter={i === targetIdx ? "url(#glow)" : "none"}
                />
                {m.map((row, r) =>
                  row.map((val, c) => (
                    <rect
                      key={`${i}-${r}-${c}`}
                      x={ox + pad + c * cell}
                      y={oy + pad + r * cell}
                      width={cell - 1}
                      height={cell - 1}
                      rx="2"
                      fill="rgba(255,220,180,1)"
                      opacity={val ? 0.9 : 0.08}
                    />
                  ))
                )}
              </g>
            );
          })}

          {/* ball (state) */}
          <circle cx={ballXY.x} cy={ballXY.y} r={7} fill="rgba(255,220,180,0.95)" filter="url(#glow)" opacity={0.92} />
        </g>
      </svg>

      <style>{`
        .pulseDot{
          display:inline-block;
          width:10px;height:10px;border-radius:50%;
          background: rgba(255,120,80,0.95);
          box-shadow: 0 0 16px rgba(255,120,80,0.45);
          animation: pulse 0.7s infinite;
        }
        @keyframes pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.85); opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}