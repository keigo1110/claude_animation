import { useState, useEffect, useRef, useCallback } from "react";

export const animationMeta = {
  id: "autopoiesis",
  label: "オートポイエーシス",
};

// ─── シミュレーション定数 ───────────────────────────────────────────────────
const S = 16;

const TYPE = {
  HOLE: "HOLE",
  SUBSTRATE: "SUBSTRATE",
  CATALYST: "CATALYST",
  LINK: "LINK",
  LINK_SUBSTRATE: "LINK_SUBSTRATE",
};

const MOBILITY = { HOLE: 0.1, SUBSTRATE: 0.1, CATALYST: 0.0001, LINK: 0.05, LINK_SUBSTRATE: 0.05 };

const P = {
  PRODUCTION: 0.98,
  DISINTEGRATION: 0.0002,
  BOND_INIT: 0.5,
  BOND_EXTEND: 0.5,
  BOND_SPLICE: 0.95,
  BOND_DECAY: 0.0003,
  ABSORPTION: 0.6,
  EMISSION: 0.6,
};

const rp = (p) => Math.random() < p;
const w = (v) => ((v % S) + S) % S;
const I = (x, y) => y * S + x;
const mk = (type) => ({ type, dis: false, bonds: [] });

const neuNbrs = (x, y) => [[w(x + 1), y], [w(x - 1), y], [x, w(y + 1)], [x, w(y - 1)]];
const morNbrs = (x, y) => [
  [w(x - 1), w(y - 1)], [x, w(y - 1)], [w(x + 1), w(y - 1)],
  [w(x - 1), y], [w(x + 1), y],
  [w(x - 1), w(y + 1)], [x, w(y + 1)], [w(x + 1), w(y + 1)],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function rand2Moore(x, y) {
  const [mx1, my1] = pick(morNbrs(x, y));
  let mx2, my2;
  if (x === mx1) { mx2 = Math.random() < 0.5 ? w(mx1 - 1) : w(mx1 + 1); my2 = my1; }
  else if (y === my1) { mx2 = mx1; my2 = Math.random() < 0.5 ? w(my1 - 1) : w(my1 + 1); }
  else { [mx2, my2] = Math.random() < 0.5 ? [x, my1] : [mx1, y]; }
  return [mx1, my1, mx2, my2];
}

function adj2Moore(x, y, mx, my) {
  if (x === mx) return [w(mx - 1), my, w(mx + 1), my];
  if (y === my) return [mx, w(my - 1), mx, w(my + 1)];
  return [x, my, mx, y];
}

const CATALYST_POSITIONS = [
  [4, 4], [11, 4], [4, 11], [11, 11], [8, 8],
];

function initParticles() {
  const ps = Array.from({ length: S * S }, () =>
    mk(rp(0.8) ? TYPE.SUBSTRATE : TYPE.HOLE)
  );
  for (const [cx, cy] of CATALYST_POSITIONS) {
    ps[I(cx, cy)] = mk(TYPE.CATALYST);
  }
  return ps;
}

function emission(ps, x, y, prob = P.EMISSION) {
  const p = ps[I(x, y)];
  if (p.type !== TYPE.LINK_SUBSTRATE) return;
  const [mx, my] = pick(morNbrs(x, y));
  const mp = ps[I(mx, my)];
  if (mp.type !== TYPE.HOLE || !rp(prob)) return;
  p.type = TYPE.LINK;
  mp.type = TYPE.SUBSTRATE;
}

function bondDecay(ps, x, y, prob = P.BOND_DECAY) {
  const p = ps[I(x, y)];
  if (p.type !== TYPE.LINK && p.type !== TYPE.LINK_SUBSTRATE) return;
  if (!rp(prob)) return;
  for (const b of p.bonds) {
    const np = ps[I(b.x, b.y)];
    np.bonds = np.bonds.filter((nb) => !(nb.x === x && nb.y === y));
  }
  p.bonds = [];
}

function production(ps, x, y) {
  const p = ps[I(x, y)];
  if (p.type !== TYPE.CATALYST) return;
  const [mx1, my1, mx2, my2] = rand2Moore(x, y);
  const p1 = ps[I(mx1, my1)];
  const p2 = ps[I(mx2, my2)];
  if (p1.type !== TYPE.SUBSTRATE || p2.type !== TYPE.SUBSTRATE) return;
  if (!rp(P.PRODUCTION)) return;
  p1.type = TYPE.HOLE;
  p2.type = TYPE.LINK;
}

function disintegration(ps, x, y) {
  const p = ps[I(x, y)];
  if ((p.type === TYPE.LINK || p.type === TYPE.LINK_SUBSTRATE) && rp(P.DISINTEGRATION)) p.dis = true;
  if (!p.dis) return;
  emission(ps, x, y, 1.0);
  const [mx, my] = pick(morNbrs(x, y));
  const mp = ps[I(mx, my)];
  if (p.type !== TYPE.LINK || mp.type !== TYPE.HOLE) return;
  bondDecay(ps, x, y, 1.0);
  p.type = TYPE.SUBSTRATE;
  p.dis = false;
  mp.type = TYPE.SUBSTRATE;
}

function absorption(ps, x, y) {
  const p = ps[I(x, y)];
  if (p.type !== TYPE.LINK) return;
  const [mx, my] = pick(morNbrs(x, y));
  const mp = ps[I(mx, my)];
  if (mp.type !== TYPE.SUBSTRATE || !rp(P.ABSORPTION)) return;
  p.type = TYPE.LINK_SUBSTRATE;
  mp.type = TYPE.HOLE;
}

function bonding(ps, x, y) {
  const p = ps[I(x, y)];
  if (p.type !== TYPE.LINK && p.type !== TYPE.LINK_SUBSTRATE) return;
  const [mx, my] = pick(morNbrs(x, y));
  const mp = ps[I(mx, my)];
  if (mp.type !== TYPE.LINK && mp.type !== TYPE.LINK_SUBSTRATE) return;
  if (p.bonds.some((b) => b.x === mx && b.y === my)) return;
  if (p.bonds.length === 2 || mp.bonds.length === 2) return;
  const [ax1, ay1, ax2, ay2] = adj2Moore(x, y, mx, my);
  if (p.bonds.some((b) => (b.x === ax1 && b.y === ay1) || (b.x === ax2 && b.y === ay2))) return;
  const adj1 = ps[I(ax1, ay1)];
  if (adj1.bonds.some((b) => b.x === ax2 && b.y === ay2)) return;
  if (morNbrs(x, y).some(([nx, ny]) => ps[I(nx, ny)].type === TYPE.CATALYST)) return;
  const prob =
    p.bonds.length === 0 && mp.bonds.length === 0 ? P.BOND_INIT :
    p.bonds.length === 1 && mp.bonds.length === 1 ? P.BOND_SPLICE :
    P.BOND_EXTEND;
  if (!rp(prob)) return;
  p.bonds.push({ x: mx, y: my });
  mp.bonds.push({ x, y });
}

function stepSim(ps) {
  const moved = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = ps[I(x, y)];
      if (moved[I(x, y)] || p.bonds.length > 0) continue;
      const [nx, ny] = pick(neuNbrs(x, y));
      const np = ps[I(nx, ny)];
      if (moved[I(nx, ny)] || np.bonds.length > 0) continue;
      const mobP = Math.sqrt(MOBILITY[p.type] * MOBILITY[np.type]);
      if (!rp(mobP)) continue;
      ps[I(x, y)] = np;
      ps[I(nx, ny)] = p;
      moved[I(x, y)] = 1;
      moved[I(nx, ny)] = 1;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      production(ps, x, y);
      disintegration(ps, x, y);
      bonding(ps, x, y);
      bondDecay(ps, x, y);
      absorption(ps, x, y);
      emission(ps, x, y);
    }
  }
}

// ─── 視覚化設定 ────────────────────────────────────────────────────────────
const CELL = 26;
const CANVAS_SIZE = S * CELL;

const STYLE = {
  HOLE:           null,
  SUBSTRATE:      { fill: "#3a7bd5", glow: "#3a7bd5", r: 3.5,  glowBlur: 8 },
  CATALYST:       { fill: "#f5c842", glow: "#ffaa00", r: 9,    glowBlur: 20 },
  LINK:           { fill: "#1fcc8e", glow: "#00ffaa", r: 6.5,  glowBlur: 14 },
  LINK_SUBSTRATE: { fill: "#a0ffd6", glow: "#a0ffd6", r: 6.5,  glowBlur: 18 },
};

function drawFrame(ctx, ps) {
  // Background
  ctx.fillStyle = "#04060f";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Subtle grid
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= S; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, CANVAS_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(CANVAS_SIZE, i * CELL); ctx.stroke();
  }

  // Bonds
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = ps[I(x, y)];
      for (const b of p.bonds) {
        if (I(x, y) >= I(b.x, b.y)) continue;
        const x1 = x * CELL + CELL / 2;
        const y1 = y * CELL + CELL / 2;
        let x2 = b.x * CELL + CELL / 2;
        let y2 = b.y * CELL + CELL / 2;
        if (Math.abs(b.x - x) > S / 2) x2 += b.x > x ? -S * CELL : S * CELL;
        if (Math.abs(b.y - y) > S / 2) y2 += b.y > y ? -S * CELL : S * CELL;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = "rgba(31, 204, 142, 0.55)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#00ffaa";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }

  // Particles
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = ps[I(x, y)];
      const s = STYLE[p.type];
      if (!s) continue;
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, s.r, 0, Math.PI * 2);
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = s.glowBlur;
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// ─── フェーズメッセージ ─────────────────────────────────────────────────────
function getPhase(step, linkCount, bondedCount) {
  if (step < 20)  return {
    msg: "🔵 材料分子が漂っています",
    sub: "青い小さな粒が「基質」＝膜を作る材料です。今は自由に動き回っているだけ。"
  };
  if (linkCount < 5)  return {
    msg: "🟡 触媒が働きはじめました",
    sub: "黄色い大きな粒が「触媒」。2つの材料分子に触れると、それらをくっつけて緑色の膜分子を生み出します。"
  };
  if (bondedCount < 3) return {
    msg: "🟢 緑の膜分子が生まれました",
    sub: "緑の粒が「膜分子」。まだバラバラに漂っていますが、偶然ぶつかると互いにつながろうとします。"
  };
  if (linkCount < 20) return {
    msg: "🔗 膜分子どうしがつながっています",
    sub: "光る線が「結合」のしるし。鎖のようにつながった膜分子が、やがて自分自身を囲む膜になっていきます。"
  };
  return {
    msg: "✨ 膜が自己を形成しています",
    sub: "誰も設計していない。ただ分子が反応し続けた結果、「内と外」を隔てる構造が自然に生まれました。"
  };
}

// ─── メインコンポーネント ───────────────────────────────────────────────────
export default function Autopoiesis() {
  const canvasRef = useRef(null);
  const psRef     = useRef(initParticles());
  const runRef    = useRef(true);
  const stepRef   = useRef(0);

  const [paused,  setPaused]  = useState(false);
  const [stats,   setStats]   = useState({ step: 0, link: 0, substrate: 0, bonded: 0 });
  const [phase,   setPhase]   = useState({ msg: "分子が空間を漂っています...", sub: "触媒が周囲の材料分子に働きかけています" });
  const pausedRef = useRef(false);

  const reset = useCallback(() => {
    psRef.current = initParticles();
    stepRef.current = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let raf;
    let lastTime = 0;
    const FPS_TARGET = 20;

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (!runRef.current) return;
      if (pausedRef.current) {
        drawFrame(ctx, psRef.current);
        return;
      }
      if (now - lastTime < 1000 / FPS_TARGET) return;
      lastTime = now;

      stepSim(psRef.current);
      stepRef.current += 1;
      drawFrame(ctx, psRef.current);

      if (stepRef.current % 3 === 0) {
        const ps = psRef.current;
        const link      = ps.filter((p) => p.type === TYPE.LINK || p.type === TYPE.LINK_SUBSTRATE).length;
        const substrate = ps.filter((p) => p.type === TYPE.SUBSTRATE).length;
        const bonded    = ps.filter((p) => p.bonds.length > 0).length;
        const step      = stepRef.current;
        setStats({ step, link, substrate, bonded });
        setPhase(getPhase(step, link, bonded));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); runRef.current = false; };
  }, []);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused((p) => !p);
  };

  const handleReset = () => {
    reset();
    stepRef.current = 0;
    setStats({ step: 0, link: 0, substrate: 0, bonded: 0 });
    setPhase(getPhase(0, 0, 0));
  };

  // ── UI ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #020510 0%, #040818 60%, #060c20 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Georgia', serif",
      color: "#ccd6f6",
      padding: "24px 16px",
      gap: 0,
    }}>
      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: "0.35em",
          color: "#1fcc8e",
          textTransform: "uppercase",
          marginBottom: 8,
          opacity: 0.8,
        }}>
          SCL Autopoiesis Model
        </div>
        <h1 style={{
          margin: 0,
          fontSize: 26,
          fontWeight: 400,
          color: "#e8f0ff",
          letterSpacing: "0.05em",
        }}>
          生命はどうやって「自分」を作るのか
        </h1>
        <p style={{
          margin: "10px auto 0",
          fontSize: 13,
          color: "#7a8fb5",
          fontFamily: "sans-serif",
          letterSpacing: "0.02em",
          lineHeight: 1.85,
          maxWidth: 500,
        }}>
          これは、生命の最小単位とも言える「自己組織化」のシミュレーションです。<br/>
          誰かが設計したわけでも、指示を出したわけでもない。<br/>
          分子どうしが出会い、反応するうちに、気づけば<em>膜</em>が生まれていく。
        </p>
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>

        {/* Canvas */}
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{
              display: "block",
              borderRadius: 4,
              border: "1px solid rgba(31,204,142,0.18)",
              boxShadow: "0 0 40px rgba(31,204,142,0.08), 0 0 80px rgba(0,0,0,0.6)",
            }}
          />
          {/* Overlay step */}
          <div style={{
            position: "absolute",
            bottom: 8,
            right: 10,
            fontSize: 10,
            color: "rgba(100,140,200,0.4)",
            fontFamily: "monospace",
            letterSpacing: "0.05em",
          }}>
            step {stats.step}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Phase description */}
          <div style={{
            background: "rgba(31,204,142,0.05)",
            border: "1px solid rgba(31,204,142,0.15)",
            borderRadius: 8,
            padding: "16px 14px",
          }}>
            <div style={{ fontSize: 14, fontWeight: 400, color: "#a0ffd6", marginBottom: 6, lineHeight: 1.5 }}>
              {phase.msg}
            </div>
            <div style={{ fontSize: 11.5, color: "#5a7a9a", fontFamily: "sans-serif", lineHeight: 1.7 }}>
              {phase.sub}
            </div>
          </div>

          {/* Stats */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8,
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <StatBar label="🟢 膜分子の数" value={stats.link} max={40} color="#1fcc8e" />
            <StatBar label="🔵 材料分子の数" value={stats.substrate} max={200} color="#3a7bd5" />
            <StatBar label="🔗 結合している膜分子" value={stats.bonded} max={30} color="#a0ffd6" />
          </div>

          {/* Legend */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "14px",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#445577", marginBottom: 12, textTransform: "uppercase", fontFamily: "sans-serif" }}>
              分子の種類
            </div>
            <LegendItem color="#3a7bd5" glow="#3a7bd5" size={7}  label="🔵 基質（材料分子）" desc="膜の原料。空間のいたるところに漂っている小さな粒" />
            <LegendItem color="#f5c842" glow="#ffaa00" size={12} label="🟡 触媒" desc="材料2つを膜分子に変える「工場」。自分自身は変化しない" />
            <LegendItem color="#1fcc8e" glow="#00ffaa" size={11} label="🟢 膜分子" desc="触媒に作られた膜の部品。互いにつながって鎖になる" />
            <LegendItem color="#a0ffd6" glow="#a0ffd6" size={11} label="🩵 膜分子（吸収中）" desc="材料を一時的に取り込んでいる膜分子。少し明るく光る" />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <div style={{ width: 28, height: 2, background: "rgba(31,204,142,0.6)", boxShadow: "0 0 4px #00ffaa", borderRadius: 1 }} />
              <div>
                <div style={{ fontSize: 12, color: "#b0cce0", fontFamily: "sans-serif" }}>― 結合（緑の線）</div>
                <div style={{ fontSize: 10, color: "#445577", fontFamily: "sans-serif" }}>膜分子どうしが手をつないだしるし</div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={togglePause} style={btnStyle("#1fcc8e")}>
              {paused ? "▶ 再生" : "⏸ 一時停止"}
            </button>
            <button onClick={handleReset} style={btnStyle("#445577")}>
              ↺ リセット
            </button>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 32,
        fontSize: 11,
        color: "#4a6080",
        fontFamily: "sans-serif",
        textAlign: "center",
        maxWidth: 520,
        lineHeight: 1.8,
        letterSpacing: "0.02em",
      }}>
        このシミュレーションは、生物学者 Varela・Maturana・Uribe が提唱した<br/>
        「<strong style={{color:"#6a9fd8"}}>オートポイエーシス</strong>」理論（1974年）をもとにしています。<br/>
        オートポイエーシスとはギリシャ語で「自己（auto）＋制作（poiesis）」。<br/>
        生命の本質は<em>物質そのもの</em>ではなく、<em>自分を作り続けるプロセス</em>にある、という考え方です。
      </div>
    </div>
  );
}

// ─── サブコンポーネント ─────────────────────────────────────────────────────
function StatBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#6a8aaa", fontFamily: "sans-serif" }}>{label}</span>
        <span style={{ fontSize: 11, color: color, fontFamily: "monospace" }}>{value}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 2,
          boxShadow: `0 0 6px ${color}`,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

function LegendItem({ color, glow, size, label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{
        width: size, height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 8px ${glow}`,
        flexShrink: 0,
      }} />
      <div>
        <div style={{ fontSize: 12, color: "#b0cce0", fontFamily: "sans-serif" }}>{label}</div>
        <div style={{ fontSize: 10, color: "#445577", fontFamily: "sans-serif" }}>{desc}</div>
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    flex: 1,
    padding: "8px 0",
    background: "transparent",
    border: `1px solid ${color}`,
    color: color,
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "sans-serif",
    letterSpacing: "0.05em",
    transition: "background 0.2s",
  };
}
