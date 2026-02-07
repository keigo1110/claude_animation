import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

/** 一覧に表示するためのメタ情報（新規アニメ追加時は id と label を設定） */
export const animationMeta = {
  id: 'neural',
  label: 'ニューラルネット比較（Feedforward vs Hopfield）',
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

  const similarity = useCallback((s, p) => {
    let match = 0;
    for (let i = 0; i < numNodes; i++) {
      if (s[i] === p[i]) match++;
    }
    return match / numNodes;
  }, [numNodes]);

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

  const similarities = hopfieldPatterns.map(p => similarity(hopfieldState, p));
  const currentEnergy = energyHistory.length > 0 ? energyHistory[energyHistory.length - 1] : energy(hopfieldState);

  const minE = energyHistory.length > 0 ? Math.min(...energyHistory) : currentEnergy;
  const maxE = energyHistory.length > 0 ? Math.max(...energyHistory) : currentEnergy;
  const energyRange = maxE - minE || 1;
  const normalizedEnergy = energyHistory.map(e => (e - minE) / energyRange);

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
            </defs>

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

            {/* Separator line */}
            <line x1="20" y1="220" x2="360" y2="220" stroke="rgba(180,100,60,0.2)" strokeWidth="1" />

            {/* Energy graph */}
            <g transform="translate(20, 240)">
              <text x="0" y="12" fill="#a86" fontSize="12" fontFamily="Helvetica Neue, Arial, sans-serif">
                Energy
              </text>
              <text x="60" y="12" fill="#ff9060" fontSize="12" fontWeight="500" fontFamily="Helvetica Neue, Arial, sans-serif">
                {currentEnergy.toFixed(1)}
              </text>
              <g transform="translate(0, 22)">
                <rect x="0" y="0" width="140" height="36" rx="4" fill="rgba(0,0,0,0.3)" />
                <line x1="6" y1="8" x2="134" y2="8" stroke="rgba(255,144,96,0.1)" strokeWidth="1" />
                <line x1="6" y1="28" x2="134" y2="28" stroke="rgba(255,144,96,0.1)" strokeWidth="1" />
                {normalizedEnergy.length > 1 && (
                  <polyline
                    points={normalizedEnergy.map((e, idx) => 
                      `${6 + idx * (128 / Math.max(normalizedEnergy.length - 1, 1))},${8 + (1 - e) * 20}`
                    ).join(' ')}
                    fill="none"
                    stroke="#ff9060"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </g>
            </g>

            {/* Memory match */}
            <g transform="translate(200, 240)">
              <text x="0" y="12" fill="#a86" fontSize="12" fontFamily="Helvetica Neue, Arial, sans-serif">
                Memory
              </text>
              {hopfieldPatterns.map((pattern, idx) => {
                const sim = similarities[idx];
                const isMatch = sim > 0.99;
                const yOffset = 24 + idx * 24;
                
                return (
                  <g key={idx} transform={`translate(0, ${yOffset})`}>
                    {pattern.map((v, pi) => (
                      <rect
                        key={pi}
                        x={pi * 8}
                        y="0"
                        width="6"
                        height="14"
                        rx="1"
                        fill={v === 1 ? '#ff9060' : '#332'}
                      />
                    ))}
                    <rect x="65" y="2" width="80" height="10" rx="2" fill="rgba(60,40,30,0.5)" />
                    <rect 
                      x="65" 
                      y="2" 
                      width={80 * sim} 
                      height="10" 
                      rx="2" 
                      fill={isMatch ? '#ff9060' : 'rgba(200,120,80,0.6)'}
                      style={{ transition: 'width 0.2s' }}
                    />
                    <text 
                      x="150" 
                      y="12" 
                      fill={isMatch ? '#ff9060' : '#886'} 
                      fontSize="11"
                      fontWeight={isMatch ? '600' : '400'}
                      fontFamily="Helvetica Neue, Arial, sans-serif"
                    >
                      {Math.round(sim * 100)}%
                    </text>
                  </g>
                );
              })}
            </g>
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
