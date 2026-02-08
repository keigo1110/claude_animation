import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

/** 一覧に表示するためのメタ情報（新規アニメ追加時は id と label を設定） */
export const animationMeta = {
  id: 'neural-2',
  label: 'ニューラルネット比較 2（Feedforward vs Hopfield）',
};

const quadraticBezier = (p0, p1, p2, t) => {
  const oneMinus = 1 - t;
  const a = oneMinus * oneMinus;
  const b = 2 * oneMinus * t;
  const c = t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x,
    y: a * p0.y + b * p1.y + c * p2.y,
  };
};

export default function NeuralNetworkComparison() {
  const containerRef = useRef(null);
  
  // ===== PLAYBACK CONTROL =====
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  
  // ===== FEEDFORWARD STATE =====
  const [ffActivations, setFfActivations] = useState([
    [0.7, 0.4, 0.9],
    [0, 0, 0, 0],
    [0, 0, 0],
    [0, 0]
  ]);
  const [ffActiveLayer, setFfActiveLayer] = useState(0);
  const [ffFinished, setFfFinished] = useState(false);

  // ===== HOPFIELD STATE =====
  const numNodes = 7;
  
  const hopfieldPatterns = useMemo(() => [
    [+1, -1, +1, -1, +1, -1, +1],
  ], []);

  const W = useMemo(() => {
    const N = numNodes;
    const M = hopfieldPatterns.length;
    const w = Array.from({ length: N }, () => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        let sum = 0;
        for (let mu = 0; mu < M; mu++) {
          sum += hopfieldPatterns[mu][i] * hopfieldPatterns[mu][j];
        }
        w[i][j] = sum / N;
      }
    }
    return w;
  }, [hopfieldPatterns, numNodes]);

  const energy = useCallback((s) => {
    let E = 0;
    for (let i = 0; i < numNodes; i++) {
      for (let j = 0; j < numNodes; j++) {
        if (i === j) continue;
        E += -0.5 * W[i][j] * s[i] * s[j];
      }
    }
    return E;
  }, [W, numNodes]);

  // 初期状態: 記憶パターンから3ビット反転
  const initialCorruptedState = useMemo(() => [+1, +1, +1, +1, +1, -1, -1], []);

  const [hopfieldState, setHopfieldState] = useState(initialCorruptedState);
  const [hopfieldIteration, setHopfieldIteration] = useState(0);
  const [hopfieldPhase, setHopfieldPhase] = useState('ready');
  const [activeNodeIndex, setActiveNodeIndex] = useState(-1);
  const [energyHistory, setEnergyHistory] = useState([]);
  const [unchangedCount, setUnchangedCount] = useState(0);

  // ===== RESET FUNCTION =====
  const resetDemo = useCallback(() => {
    setFfActivations([
      [0.7, 0.4, 0.9],
      [0, 0, 0, 0],
      [0, 0, 0],
      [0, 0]
    ]);
    setFfActiveLayer(0);
    setFfFinished(false);
    setHopfieldState([...initialCorruptedState]);
    setHopfieldIteration(0);
    setHopfieldPhase('ready');
    setActiveNodeIndex(-1);
    setEnergyHistory([energy(initialCorruptedState)]);
    setHasFinished(false);
    setUnchangedCount(0);
  }, [initialCorruptedState, energy]);

  // ===== START PLAYBACK =====
  const startPlayback = useCallback(() => {
    resetDemo();
    setIsPlaying(true);
    setTimeout(() => setHopfieldPhase('evolving'), 100);
  }, [resetDemo]);

  // ===== FEEDFORWARD DYNAMICS =====
  // 1サイクル完了（全レイヤー通過）したら停止
  useEffect(() => {
    if (!isPlaying || ffFinished) return;

    const interval = setInterval(() => {
      setFfActiveLayer(prev => {
        const next = prev + 1;
        
        if (next === 4) {
          // 最後のレイヤーに到達 - 全ノードを計算して停止
          setFfActivations(prevAct => {
            const newAct = [...prevAct.map(l => [...l])];
            const srcLayer = prevAct[3 - 1];
            const dstLayer = newAct[3];
            for (let j = 0; j < dstLayer.length; j++) {
              let sum = 0;
              for (let i = 0; i < srcLayer.length; i++) {
                sum += srcLayer[i] * (0.3 + Math.random() * 0.4);
              }
              dstLayer[j] = Math.tanh(sum / srcLayer.length + (Math.random() - 0.5) * 0.3);
              dstLayer[j] = Math.max(0, Math.min(1, (dstLayer[j] + 1) / 2));
            }
            return newAct;
          });
          setFfFinished(true);
          return 4; // 最終状態を維持
        }
        
        if (next > 0 && next < 4) {
          setFfActivations(prevAct => {
            const newAct = [...prevAct.map(l => [...l])];
            const srcLayer = prevAct[next - 1];
            const dstLayer = newAct[next];
            for (let j = 0; j < dstLayer.length; j++) {
              let sum = 0;
              for (let i = 0; i < srcLayer.length; i++) {
                sum += srcLayer[i] * (0.3 + Math.random() * 0.4);
              }
              dstLayer[j] = Math.tanh(sum / srcLayer.length + (Math.random() - 0.5) * 0.3);
              dstLayer[j] = Math.max(0, Math.min(1, (dstLayer[j] + 1) / 2));
            }
            return newAct;
          });
        }
        return next;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isPlaying, ffFinished]);

  // ===== HOPFIELD DYNAMICS (ゆっくり) =====
  useEffect(() => {
    if (!isPlaying || hopfieldPhase !== 'evolving') return;

    const interval = setInterval(() => {
      const i = hopfieldIteration % numNodes;
      setActiveNodeIndex(i);

      setHopfieldState(prev => {
        const next = [...prev];
        
        let h = 0;
        for (let j = 0; j < numNodes; j++) {
          if (j !== i) h += W[i][j] * prev[j];
        }
        
        const oldValue = prev[i];
        next[i] = h >= 0 ? +1 : -1;

        const newE = energy(next);
        setEnergyHistory(hist => [...hist, newE]);

        // 収束チェック
        if (oldValue === next[i]) {
          setUnchangedCount(c => c + 1);
        } else {
          setUnchangedCount(0);
        }

        return next;
      });

      setHopfieldIteration(k => {
        if (unchangedCount >= numNodes || k >= 35) {
          setHopfieldPhase('converged');
          setActiveNodeIndex(-1);
          return k;
        }
        return k + 1;
      });
    }, 500); // 500msに遅く

    return () => clearInterval(interval);
  }, [isPlaying, hopfieldPhase, hopfieldIteration, numNodes, W, energy, unchangedCount]);

  // ===== AUTO STOP AFTER BOTH COMPLETE =====
  useEffect(() => {
    if (hopfieldPhase === 'converged' && ffFinished && isPlaying) {
      const timeout = setTimeout(() => {
        setIsPlaying(false);
        setHasFinished(true);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [hopfieldPhase, ffFinished, isPlaying]);

  // ===== LAYOUT =====
  const panelWidth = 380;
  const panelHeight = 340;
  const inputDigit = 3;
  const energyScene = {
    x: 12,
    y: 186,
    width: 356,
    height: 138,
  };

  const energyAttractors = useMemo(() => ([
    { digit: 0, x: 64, y: 76 },
    { digit: 1, x: 126, y: 64 },
    { digit: 2, x: 190, y: 72 },
    { digit: 3, x: 254, y: 94 },
    { digit: 4, x: 314, y: 64 },
  ]), []);

  const targetAttractor = energyAttractors.find(a => a.digit === inputDigit) || energyAttractors[0];
  const inputAnchor = { x: 314, y: 16 };
  const controlAnchor = {
    x: (inputAnchor.x + targetAttractor.x) / 2 + 10,
    y: Math.min(inputAnchor.y, targetAttractor.y) - 36,
  };
  const attractorProgress = hopfieldPhase === 'converged'
    ? 1
    : (isPlaying ? Math.min(hopfieldIteration / 12, 1) : 0);
  const movingPoint = quadraticBezier(inputAnchor, controlAnchor, targetAttractor, attractorProgress);

  const surfaceBounds = {
    x: 8,
    y: 22,
    width: energyScene.width - 16,
    height: 86,
  };
  const surfaceCols = 26;
  const surfaceRows = 7;
  const surfaceAmplitude = 18;
  const surfaceSkew = 18;
  const attractorNorms = energyAttractors.map((point) => ({
    digit: point.digit,
    x: Math.min(1, Math.max(0, (point.x - surfaceBounds.x) / surfaceBounds.width)),
    y: Math.min(1, Math.max(0, (point.y - surfaceBounds.y) / surfaceBounds.height)),
  }));

  const energyHeightAt = (x, y) => {
    const cx = 0.55;
    const cy = 0.45;
    const quad = 1.05
      - (1.7 * (x - cx) * (x - cx)
        + 1.15 * (y - cy) * (y - cy)
        + 0.6 * (x - cx) * (y - cy));
    let wells = 0;
    for (const well of attractorNorms) {
      const dx = x - well.x;
      const dy = y - well.y;
      const depth = well.digit === inputDigit ? 1.15 : 0.7;
      wells += depth * Math.exp(-(dx * dx + dy * dy) * 16);
    }
    return quad - wells;
  };

  const energySurface = useMemo(() => {
    const rows = [];
    const cols = [];
    for (let r = 0; r <= surfaceRows; r++) {
      const t = r / surfaceRows;
      const yBase = surfaceBounds.y + t * surfaceBounds.height;
      const points = [];
      for (let c = 0; c <= surfaceCols; c++) {
        const s = c / surfaceCols;
        const xBase = surfaceBounds.x + s * surfaceBounds.width + (t - 0.5) * surfaceSkew;
        const height = energyHeightAt(s, t);
        const y = yBase - height * surfaceAmplitude;
        points.push(`${xBase.toFixed(2)},${y.toFixed(2)}`);
      }
      rows.push(points.join(' '));
    }
    for (let c = 0; c <= surfaceCols; c += 3) {
      const s = c / surfaceCols;
      const points = [];
      for (let r = 0; r <= surfaceRows; r++) {
        const t = r / surfaceRows;
        const xBase = surfaceBounds.x + s * surfaceBounds.width + (t - 0.5) * surfaceSkew;
        const height = energyHeightAt(s, t);
        const y = surfaceBounds.y + t * surfaceBounds.height - height * surfaceAmplitude;
        points.push(`${xBase.toFixed(2)},${y.toFixed(2)}`);
      }
      cols.push(points.join(' '));
    }
    return { rows, cols };
  }, [surfaceRows, surfaceCols, surfaceBounds, surfaceAmplitude, surfaceSkew, attractorNorms]);

  const ffLayers = [
    [{ x: 70, y: 50 }, { x: 70, y: 115 }, { x: 70, y: 180 }],
    [{ x: 150, y: 30 }, { x: 150, y: 85 }, { x: 150, y: 140 }, { x: 150, y: 195 }],
    [{ x: 230, y: 50 }, { x: 230, y: 115 }, { x: 230, y: 180 }],
    [{ x: 310, y: 82 }, { x: 310, y: 147 }],
  ];

  const hopfieldNodes = useMemo(() => {
    const cx = 190, cy = 110, r = 80;
    return Array(numNodes).fill(0).map((_, i) => ({
      x: cx + r * Math.cos(2 * Math.PI * i / numNodes - Math.PI / 2),
      y: cy + r * Math.sin(2 * Math.PI * i / numNodes - Math.PI / 2),
    }));
  }, [numNodes]);

  const nodeToAttractor = useMemo(() => (
    hopfieldNodes.map((_, index) => energyAttractors[index % energyAttractors.length])
  ), [hopfieldNodes, energyAttractors]);

  const activeAttractor = activeNodeIndex >= 0 ? nodeToAttractor[activeNodeIndex] : null;

  const currentEnergy = energyHistory.length > 0 ? energyHistory[energyHistory.length - 1] : energy(hopfieldState);

  const minE = energyHistory.length > 0 ? Math.min(...energyHistory) : currentEnergy;
  const maxE = energyHistory.length > 0 ? Math.max(...energyHistory) : currentEnergy;
  const energyRange = maxE - minE || 1;
  const normalizedEnergy = energyHistory.map(e => (e - minE) / energyRange);
  const energyPulse = normalizedEnergy.length > 0
    ? normalizedEnergy[normalizedEnergy.length - 1]
    : 0.5;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#08080a',
      padding: '32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
    }}>
      
      {/* Play Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '8px',
      }}>
        <button
          onClick={startPlayback}
          disabled={isPlaying && !hasFinished}
          style={{
            background: isPlaying && !hasFinished 
              ? 'rgba(80,80,80,0.5)' 
              : 'linear-gradient(135deg, #ff9060, #ff7040)',
            color: '#fff',
            border: 'none',
            padding: '14px 32px',
            borderRadius: '30px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isPlaying && !hasFinished ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: isPlaying && !hasFinished 
              ? 'none'
              : '0 4px 20px rgba(255,112,64,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {isPlaying && !hasFinished ? (
            <>
              <span style={{ 
                display: 'inline-block',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#ff6040',
                animation: 'pulse 0.6s infinite',
              }} />
              Recording...
            </>
          ) : hasFinished ? (
            <>
              <span style={{ fontSize: '18px' }}>↻</span>
              Replay
            </>
          ) : (
            <>
              <span style={{ fontSize: '18px' }}>▶</span>
              Start Demo
            </>
          )}
        </button>
        
        {hasFinished && (
          <span style={{ 
            color: '#4c8', 
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{ fontSize: '16px' }}>✓</span>
            Complete
          </span>
        )}
      </div>

      {/* Main comparison */}
      <div 
        ref={containerRef}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: '40px',
          background: '#08080a',
          padding: '20px',
        }}
      >
        
        {/* ===== FEEDFORWARD NETWORK ===== */}
        <div style={{
          background: 'rgba(15,20,35,0.8)',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid rgba(70,110,180,0.3)',
        }}>
          <svg width={panelWidth} height={panelHeight} style={{ display: 'block' }}>
            <defs>
              <filter id="glowBlue">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <marker id="arrowBlue" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                <polygon points="0 0, 12 4, 0 8" fill="rgba(80,130,200,0.6)" />
              </marker>
            </defs>

            {/* Connections */}
            {ffLayers.slice(0, -1).map((layer, li) =>
              layer.map((node, ni) =>
                ffLayers[li + 1].map((nextNode, nj) => {
                  const isActive = ffActiveLayer === li + 1;
                  return (
                    <line
                      key={`ff-${li}-${ni}-${nj}`}
                      x1={node.x}
                      y1={node.y}
                      x2={nextNode.x}
                      y2={nextNode.y}
                      stroke={isActive ? 'rgba(100,160,240,0.5)' : 'rgba(50,80,130,0.2)'}
                      strokeWidth={isActive ? 2 : 1}
                      style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                    />
                  );
                })
              )
            )}

            {/* Nodes */}
            {ffLayers.map((layer, li) =>
              layer.map((node, ni) => {
                const activation = ffActivations[li]?.[ni] || 0;
                const isLayerActive = li <= ffActiveLayer;
                const intensity = isLayerActive ? activation : 0;
                
                return (
                  <circle
                    key={`node-${li}-${ni}`}
                    cx={node.x}
                    cy={node.y}
                    r="14"
                    fill={`rgba(${30 + intensity * 80}, ${50 + intensity * 100}, ${100 + intensity * 155}, 0.95)`}
                    stroke={isLayerActive ? `rgba(${100 + intensity * 100}, ${150 + intensity * 80}, ${220}, 0.9)` : 'rgba(60,90,140,0.5)'}
                    strokeWidth="2"
                    filter={intensity > 0.6 ? 'url(#glowBlue)' : 'none'}
                    style={{ transition: 'fill 0.3s, stroke 0.3s' }}
                  />
                );
              })
            )}

            {/* Direction arrow */}
            <path
              d="M 50 300 L 330 300"
              stroke="rgba(80,130,200,0.4)"
              strokeWidth="2"
              fill="none"
              markerEnd="url(#arrowBlue)"
            />
          </svg>
        </div>

        {/* ===== HOPFIELD NETWORK ===== */}
        <div style={{
          background: 'rgba(35,20,15,0.8)',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid rgba(180,100,60,0.3)',
        }}>
          <svg width={panelWidth} height={panelHeight} style={{ display: 'block' }}>
            <defs>
              <filter id="glowOrange">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="glowOrangeStrong">
                <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="energyGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="10" result="blurred"/>
                <feMerge>
                  <feMergeNode in="blurred"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Energy landscape (memory field) */}
            <g transform={`translate(${energyScene.x}, ${energyScene.y})`}>
              <rect
                x="0"
                y="0"
                width={energyScene.width}
                height={energyScene.height}
                rx="10"
                fill="rgba(10,8,16,0.92)"
                stroke="rgba(255,180,120,0.12)"
              />
              <g transform="translate(0, 6)">
                <rect
                  x={surfaceBounds.x}
                  y={surfaceBounds.y}
                  width={surfaceBounds.width}
                  height={surfaceBounds.height}
                  rx="8"
                  fill="rgba(18,14,28,0.6)"
                  stroke="rgba(180,140,220,0.15)"
                />
                {energySurface.rows.map((points, idx) => (
                  <polyline
                    key={`surface-row-${idx}`}
                    points={points}
                    fill="none"
                    stroke={`rgba(210,180,255,${0.18 + idx * 0.05})`}
                    strokeWidth="1.2"
                  />
                ))}
                {energySurface.cols.map((points, idx) => (
                  <polyline
                    key={`surface-col-${idx}`}
                    points={points}
                    fill="none"
                    stroke="rgba(255,200,140,0.2)"
                    strokeWidth="1"
                  />
                ))}
                <path
                  d={`M ${surfaceBounds.x} ${surfaceBounds.y + surfaceBounds.height}
                      L ${surfaceBounds.x + surfaceBounds.width} ${surfaceBounds.y + surfaceBounds.height}
                      L ${surfaceBounds.x + surfaceBounds.width + surfaceSkew * 0.5} ${surfaceBounds.y + surfaceBounds.height + 26}
                      L ${surfaceBounds.x + surfaceSkew * 0.5} ${surfaceBounds.y + surfaceBounds.height + 26}
                      Z`}
                  fill="rgba(20,10,30,0.35)"
                />
                <path
                  d={`M ${surfaceBounds.x} ${surfaceBounds.y}
                      L ${surfaceBounds.x + surfaceBounds.width} ${surfaceBounds.y}
                      L ${surfaceBounds.x + surfaceBounds.width + surfaceSkew * 0.5} ${surfaceBounds.y + 26}
                      L ${surfaceBounds.x + surfaceSkew * 0.5} ${surfaceBounds.y + 26}
                      Z`}
                  fill="rgba(120,80,160,0.12)"
                  opacity={0.4 + energyPulse * 0.3}
                />
              </g>

              {/* Memory attractors */}
              {energyAttractors.map((point) => {
                const isTarget = point.digit === inputDigit;
                const mappedNodes = nodeToAttractor
                  .map((mapped, idx) => (mapped.digit === point.digit ? idx : null))
                  .filter((idx) => idx !== null);
                return (
                  <g key={point.digit} transform={`translate(${point.x}, ${point.y})`}>
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="38"
                      stroke={isTarget ? 'rgba(255,200,140,0.9)' : 'rgba(200,160,220,0.5)'}
                      strokeWidth={isTarget ? 2.2 : 1.4}
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r={isTarget ? 4.4 : 3.2}
                      fill={isTarget ? '#ffd2a0' : '#c7b0e8'}
                      filter={isTarget ? 'url(#energyGlow)' : 'none'}
                    />
                    <circle
                      cx="0"
                      cy="38"
                      r={isTarget ? 4.8 : 3.4}
                      fill={isTarget ? '#ffe6cc' : '#f4e9ff'}
                      opacity={isTarget ? 0.95 : 0.65}
                    />
                    <text
                      x="8"
                      y="-6"
                      fill={isTarget ? '#ffd2a0' : '#c8b6ff'}
                      fontSize="11"
                      fontWeight={isTarget ? 600 : 400}
                      fontFamily="Helvetica Neue, Arial, sans-serif"
                    >
                      {point.digit}
                    </text>
                    {mappedNodes.map((nodeIndex, idx) => {
                      const isActiveNode = nodeIndex === activeNodeIndex;
                      return (
                        <g key={`map-${nodeIndex}`} transform={`translate(${8 + idx * 12}, 10)`}>
                          <circle
                            cx="0"
                            cy="0"
                            r={isActiveNode ? 3.4 : 2.6}
                            fill={isActiveNode ? '#ffe8cc' : 'rgba(220,200,255,0.8)'}
                            stroke={isActiveNode ? '#fff0d6' : 'rgba(180,160,220,0.6)'}
                            strokeWidth={isActiveNode ? 1.2 : 0.8}
                          />
                          <text
                            x="5"
                            y="3"
                            fill={isActiveNode ? '#ffe8cc' : 'rgba(200,180,235,0.9)'}
                            fontSize="9"
                            fontWeight={isActiveNode ? 600 : 400}
                            fontFamily="Helvetica Neue, Arial, sans-serif"
                          >
                            {nodeIndex}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Input trajectory */}
              <g transform="translate(0, 6)">
                <path
                  d={`M ${inputAnchor.x} ${inputAnchor.y} Q ${controlAnchor.x} ${controlAnchor.y} ${targetAttractor.x} ${targetAttractor.y}`}
                  fill="none"
                  stroke="rgba(255,220,180,0.6)"
                  strokeWidth="1.6"
                  strokeDasharray="4 4"
                />
                <circle cx={movingPoint.x} cy={movingPoint.y} r="4.5" fill="#fff0d6" opacity="0.9" />
                <circle cx={inputAnchor.x} cy={inputAnchor.y} r="3.4" fill="#fff0d6" opacity="0.8" />
                <text
                  x={inputAnchor.x + 10}
                  y={inputAnchor.y + 4}
                  fill="#ffe4c8"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="Helvetica Neue, Arial, sans-serif"
                >
                  input {inputDigit}
                </text>
                <text
                  x={targetAttractor.x - 10}
                  y={targetAttractor.y + 22}
                  fill="#ffd2a0"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="Helvetica Neue, Arial, sans-serif"
                >
                  memory {inputDigit}
                </text>
              </g>

              {/* Ground grid */}
              <g transform="translate(0, 98)" opacity="0.25">
                {Array.from({ length: 7 }).map((_, idx) => (
                  <line
                    key={`grid-h-${idx}`}
                    x1="6"
                    y1={idx * 6}
                    x2={energyScene.width - 6}
                    y2={idx * 6}
                    stroke="rgba(255,180,120,0.35)"
                    strokeWidth="1"
                  />
                ))}
              </g>
            </g>

            {/* Active node mapping line */}
            {activeAttractor && activeNodeIndex >= 0 && (
              <line
                x1={hopfieldNodes[activeNodeIndex].x}
                y1={hopfieldNodes[activeNodeIndex].y}
                x2={energyScene.x + activeAttractor.x}
                y2={energyScene.y + activeAttractor.y + 6}
                stroke="rgba(255,220,180,0.45)"
                strokeWidth="1.4"
                strokeDasharray="4 4"
              />
            )}

            {/* All-to-all connections */}
            {hopfieldNodes.map((node, i) =>
              hopfieldNodes.slice(i + 1).map((other, j) => {
                const actualJ = i + j + 1;
                const weight = W[i][actualJ];
                const isActive = activeNodeIndex !== -1 && 
                  (i === activeNodeIndex || actualJ === activeNodeIndex);
                const isExcitatory = weight > 0;
                
                return (
                  <line
                    key={`hf-${i}-${actualJ}`}
                    x1={node.x}
                    y1={node.y}
                    x2={other.x}
                    y2={other.y}
                    stroke={isActive 
                      ? (isExcitatory ? 'rgba(255,160,100,0.7)' : 'rgba(100,160,255,0.7)')
                      : (isExcitatory ? 'rgba(180,100,60,0.2)' : 'rgba(80,120,180,0.15)')
                    }
                    strokeWidth={isActive ? 2.5 : 1}
                    strokeDasharray={isExcitatory ? 'none' : '4 2'}
                    style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
                  />
                );
              })
            )}

            {/* Nodes */}
            {hopfieldNodes.map((node, i) => {
              const stateValue = hopfieldState[i];
              const isOn = stateValue === 1;
              const isActive = i === activeNodeIndex;
              const isConverged = hopfieldPhase === 'converged';
              
              return (
                <g key={`hf-node-${i}`}>
                  {isActive && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r="28"
                      fill="none"
                      stroke="#ff9060"
                      strokeWidth="2"
                      opacity="0.6"
                      filter="url(#glowOrangeStrong)"
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="18"
                    fill={isOn ? 'rgba(255,140,80,0.95)' : 'rgba(35,25,20,0.95)'}
                    stroke={isActive ? '#fff' : (isOn ? '#ffb080' : 'rgba(120,80,60,0.5)')}
                    strokeWidth={isActive ? 3 : 2}
                    filter={isConverged && isOn ? 'url(#glowOrange)' : 'none'}
                    style={{ transition: 'fill 0.15s, stroke 0.15s' }}
                  />
                </g>
              );
            })}

          </svg>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
