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
    return wells.map((w, i) => {
      const drift = 0.003 * Math.sin(0.75 * step + i * 1.3 + phase * Math.PI * 1.5);
      const ampShift = 1 + 0.022 * Math.sin(0.55 * step + i * 1.7 + phase * Math.PI);
      const widthShift = 1 + 0.02 * Math.cos(0.45 * step + i * 1.1 - phase * Math.PI);
      return {
        mu: w.mu + drift,
        width: w.width * widthShift,
        amp: w.amp * ampShift,
      };
    });
  }, [wells, step, feedbackPhase, isPlaying]);

  const curve = useMemo(() => buildEnergyCurve(energyWells), [energyWells]);
  // 表示用: 谷を下・山を上にする（En は低E=小→谷なので、1-En で y は下が正の SVG で谷が下に）
  const EnDisplay = useMemo(() => curve.En.map((e) => 1 - e), [curve.En]);

  const W = 960;
  const H = 670;

  const energyBox = { x: 50, y: 370, w: 860, h: 220 };
  const energyTopPad = 26;
  const energyH = energyBox.h - energyTopPad - 12;

  const pathD = useMemo(
    () =>
      pathFromCurve(
        curve.xs,
        EnDisplay,
        energyBox.x,
        energyBox.y + energyTopPad,
        energyBox.w,
        energyH
      ),
    [curve.xs, EnDisplay, energyBox.x, energyBox.y, energyBox.w, energyH]
  );

  // ball moves monotonically along one valley side: s(t) from 0.58 -> 0.68
  const s0 = 0.58;
  const s1 = 0.68;
  const sNow = lerp(s0, s1, t);

  const ballXY = useMemo(() => {
    const idx = Math.round(sNow * 220);
    const x = energyBox.x + sNow * energyBox.w;
    const y =
      energyBox.y +
      energyTopPad +
      EnDisplay[clamp(idx, 0, EnDisplay.length - 1)] * energyH;
    return { x, y };
  }, [sNow, EnDisplay, energyBox.x, energyBox.y, energyBox.w, energyH]);

  const valleyDots = useMemo(() => {
    return energyWells.map((w) => {
      const idx = Math.round(w.mu * 220);
      const x = energyBox.x + w.mu * energyBox.w;
      const y =
        energyBox.y +
        energyTopPad +
        EnDisplay[clamp(idx, 0, EnDisplay.length - 1)] * energyH;
      return { x, y };
    });
  }, [energyWells, EnDisplay, energyBox.x, energyBox.y, energyBox.w, energyH]);

  const loopPulse = isPlaying ? 0.35 + 0.65 * (step % 2) : 0.35;
  const feedbackLoop = useMemo(
    () => ({
      p0: { x: 550, y: 210 },
      p1: { x: 620, y: 260 },
      p2: { x: 620, y: 330 },
      p3: { x: 480, y: 336 },
      p4: { x: 340, y: 330 },
      p5: { x: 340, y: 260 },
      p6: { x: 410, y: 210 },
    }),
    []
  );
  const feedbackPathD = useMemo(
    () =>
      `M ${feedbackLoop.p0.x} ${feedbackLoop.p0.y} ` +
      `C ${feedbackLoop.p1.x} ${feedbackLoop.p1.y}, ${feedbackLoop.p2.x} ${feedbackLoop.p2.y}, ${feedbackLoop.p3.x} ${feedbackLoop.p3.y} ` +
      `C ${feedbackLoop.p4.x} ${feedbackLoop.p4.y}, ${feedbackLoop.p5.x} ${feedbackLoop.p5.y}, ${feedbackLoop.p6.x} ${feedbackLoop.p6.y}`,
    [feedbackLoop]
  );
  const feedbackBall = useMemo(() => {
    if (feedbackPhase <= 0.5) {
      const u = feedbackPhase * 2;
      return cubicBezierPoint(feedbackLoop.p0, feedbackLoop.p1, feedbackLoop.p2, feedbackLoop.p3, u);
    }
    const u = (feedbackPhase - 0.5) * 2;
    return cubicBezierPoint(feedbackLoop.p3, feedbackLoop.p4, feedbackLoop.p5, feedbackLoop.p6, u);
  }, [feedbackPhase, feedbackLoop]);

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

        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.80)" }}>
          反復更新（feedback）で energy が下がり、谷（安定点）に収束 → 欠けた情報が補完される（連想）
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
        </defs>

        {/* background card */}
        <rect x="22" y="74" width={W - 44} height={H - 96} rx="18" fill="rgba(34,18,12,0.88)" stroke="rgba(220,130,70,0.24)" />
        <text x="44" y="112" fill="rgba(255,210,170,0.95)" fontSize="15" fontWeight="900">
          連想記憶
        </text>

        {/* left: cue */}
        <PixelGrid x={120} y={150} cell={20} grid={cue.map(row => row.map(v => (v === -1 ? 0.10 : v ? 0.85 : 0.06)))} label="外界情報" accent="rgba(255,200,150,1)" glow={0.1} />

        {/* middle: state */}
        <PixelGrid x={430} y={150} cell={20} grid={stateGrid} label={step < 2 ? "状態（初期）" : "状態（反復で更新）"} accent="rgba(255,220,180,1)" glow={isPlaying ? 0.6 : hasFinished ? 0.8 : 0.2} />

        {/* right: converged memory */}
        <PixelGrid x={740} y={150} cell={20} grid={target.map(row => row.map(v => (v ? 0.95 : 0.06)))} label="記憶（安定点）" accent="rgba(255,20,210,1)" glow={hasFinished ? 0.9 : 0.2} />

        {/* arrows */}
        <line x1={250} y1={190} x2={410} y2={190} stroke="rgba(255,200,150,0.65)" strokeWidth="2.4" markerEnd="url(#arrow)" />
        <line x1={560} y1={190} x2={720} y2={190} stroke={`rgba(255,220,180,${0.25 + 0.60 * t})`} strokeWidth="2.4" markerEnd="url(#arrow)" />

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
          <text x={energyBox.x} y={energyBox.y - 8} fill="rgba(255,255,255,0.78)" fontSize="13" fontWeight="900">
            エネルギー地形：更新ごとに谷（安定点）へ
          </text>
          <rect
            x={energyBox.x - 18}
            y={energyBox.y - 22}
            width={energyBox.w + 36}
            height={energyBox.h + 20}
            rx="16"
            fill="rgba(0,0,0,0.18)"
            stroke="rgba(255,255,255,0.10)"
          />
          <path d={pathD} fill="none" stroke="rgba(255,200,150,0.44)" strokeWidth="2.2" />

          {/* 各谷の位置の下側に記憶の記号を配置（曲線と重ならないよう下にオフセット） */}
          {valleyDots.map((v, i) => {
            const m = memories[i];
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