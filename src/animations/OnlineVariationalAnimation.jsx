import React, { useState, useEffect, useRef, useCallback } from 'react';

/** 一覧に表示するためのメタ情報（新規アニメ追加時は id と label を設定） */
export const animationMeta = {
  id: 'variational',
  label: 'オンライン変分最適化（MPC追従）',
};

const OnlineVariationalAnimation = () => {
  const [ballPos, setBallPos] = useState({ x: 80, y: 320 });
  const [ballAngle, setBallAngle] = useState(-Math.PI / 5);
  const [targetPos, setTargetPos] = useState({ x: 460, y: 80 });
  const [isMoving, setIsMoving] = useState(false);
  const [trail, setTrail] = useState([]);
  const [timeStep, setTimeStep] = useState(0);
  const [phase, setPhase] = useState(0);
  const [optimalPath, setOptimalPath] = useState([]);
  const [candidatePaths, setCandidatePaths] = useState([]);
  const [historicalSnapshots, setHistoricalSnapshots] = useState([]);
  const [targetTrail, setTargetTrail] = useState([]);
  
  const animationRef = useRef(null);
  const stateRef = useRef({ x: 80, y: 320, theta: -Math.PI / 5 });
  const timeRef = useRef(0);
  
  const canvasWidth = 580;
  const canvasHeight = 400;
  
  // パラメータ
  const velocity = 2.2;
  const horizon = 22; // 長めのホライズン
  const lambda = 0.3;

  const getTargetPosition = useCallback((t) => {
    const centerX = 380;
    const centerY = 200;
    const radiusX = 140;
    const radiusY = 90;
    const speed = 0.014;
    return {
      x: centerX + radiusX * Math.cos(t * speed - Math.PI / 2),
      y: centerY + radiusY * Math.sin(t * speed - Math.PI / 2)
    };
  }, []);

  // Unicycleダイナミクスでロールアウト（目標軌道を考慮）
  const rollout = useCallback((startState, omegaSequence, currentTime, getTarget) => {
    const path = [{ x: startState.x, y: startState.y }];
    let x = startState.x;
    let y = startState.y;
    let theta = startState.theta;
    let cost = 0;
    
    for (let k = 0; k < omegaSequence.length; k++) {
      const omega = omegaSequence[k];
      theta += omega;
      x += velocity * Math.cos(theta);
      y += velocity * Math.sin(theta);
      path.push({ x, y });
      
      // k ステップ先の目標位置を予測
      const futureTarget = getTarget(currentTime + k + 1);
      const dx = x - futureTarget.x;
      const dy = y - futureTarget.y;
      cost += dx * dx + dy * dy + lambda * omega * omega * 100;
    }
    
    // 終端コスト（ホライズン末端での目標位置）
    const finalTarget = getTarget(currentTime + omegaSequence.length);
    const dx = x - finalTarget.x;
    const dy = y - finalTarget.y;
    cost += (dx * dx + dy * dy) * 2;
    
    return { path, cost, finalTheta: theta, firstOmega: omegaSequence[0] };
  }, [velocity, lambda]);

  // 簡易MPC（目標軌道を先読み）
  const solveMPC = useCallback((state, currentTime, getTarget) => {
    const results = [];
    
    // 目標方向への角度差を計算
    const target = getTarget(currentTime);
    const targetAngle = Math.atan2(target.y - state.y, target.x - state.x);
    let angleDiff = targetAngle - state.theta;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // 目標方向を中心に、小さな範囲で候補を探索
    // 「どのくらい急に曲がるか」のバリエーション
    const turnRates = [-0.03, -0.015, 0, 0.015, 0.03];
    
    for (const turnOffset of turnRates) {
      // 基本は目標方向へ向かう角速度 + 微調整
      const baseOmega = angleDiff * 0.1 + turnOffset;
      const omegaSeq = Array(horizon).fill(baseOmega);
      const result = rollout(state, omegaSeq, currentTime, getTarget);
      results.push(result);
    }
    
    results.sort((a, b) => a.cost - b.cost);
    
    return {
      optimal: results[0],
      candidates: results.slice(1, 4)
    };
  }, [rollout, horizon]);

  useEffect(() => {
    if (!isMoving) return;

    const animate = () => {
      timeRef.current += 1;
      const t = timeRef.current;
      
      const newTarget = getTargetPosition(t);
      const currentState = stateRef.current;
      
      const dx = newTarget.x - currentState.x;
      const dy = newTarget.y - currentState.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 20) {
        setIsMoving(false);
        setPhase(2);
        setBallPos({ x: currentState.x, y: currentState.y });
        setBallAngle(currentState.theta);
        setTargetPos(newTarget);
        setOptimalPath([]);
        setCandidatePaths([]);
        return;
      }
      
      // MPC解く（目標軌道を先読み）
      const mpcResult = solveMPC(currentState, t, getTargetPosition);
      
      const omega = mpcResult.optimal.firstOmega;
      const newTheta = currentState.theta + omega;
      const newX = currentState.x + velocity * Math.cos(newTheta);
      const newY = currentState.y + velocity * Math.sin(newTheta);
      
      stateRef.current = { x: newX, y: newY, theta: newTheta };
      
      setTimeStep(t);
      setTargetPos(newTarget);
      setBallPos({ x: newX, y: newY });
      setBallAngle(newTheta);
      setOptimalPath(mpcResult.optimal.path);
      setCandidatePaths(mpcResult.candidates.map(c => c.path));
      setTrail(prev => [...prev.slice(-500), { x: newX, y: newY }]);
      setTargetTrail(prev => [...prev.slice(-150), { ...newTarget }]);
      
      if (t % 28 === 0 && t < 350) {
        setHistoricalSnapshots(snaps => [...snaps.slice(-4), {
          ball: { x: currentState.x, y: currentState.y },
          target: { ...newTarget },
          path: mpcResult.optimal.path,
          time: t
        }]);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isMoving, getTargetPosition, solveMPC, velocity]);

  const startAnimation = () => {
    stateRef.current = { x: 80, y: 320, theta: -Math.PI / 5 };
    timeRef.current = 0;
    
    setBallPos({ x: 80, y: 320 });
    setBallAngle(-Math.PI / 5);
    setTargetPos(getTargetPosition(0));
    setTrail([]);
    setTargetTrail([]);
    setTimeStep(0);
    setPhase(1);
    setHistoricalSnapshots([]);
    setOptimalPath([]);
    setCandidatePaths([]);
    setIsMoving(true);
  };

  const resetAnimation = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setIsMoving(false);
    
    stateRef.current = { x: 80, y: 320, theta: -Math.PI / 5 };
    timeRef.current = 0;
    
    setBallPos({ x: 80, y: 320 });
    setBallAngle(-Math.PI / 5);
    setTargetPos(getTargetPosition(0));
    setTrail([]);
    setTargetTrail([]);
    setTimeStep(0);
    setPhase(0);
    setOptimalPath([]);
    setCandidatePaths([]);
    setHistoricalSnapshots([]);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: '"Noto Serif JP", "Hiragino Mincho ProN", Georgia, serif',
      padding: '24px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '2px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        maxWidth: '700px'
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: '20px 32px 16px',
          borderBottom: '1px solid #e8e8e8'
        }}>
          <div style={{
            fontSize: '10px',
            color: '#999',
            letterSpacing: '1.5px',
            marginBottom: '4px',
            fontFamily: 'sans-serif'
          }}>
            FIGURE 1
          </div>
          <h1 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#222',
            margin: 0,
            lineHeight: '1.5'
          }}>
            フィードバック制御によるオンライン変分最適化
          </h1>
        </div>

        {/* キャンバス */}
        <div style={{ padding: '24px 32px' }}>
          <div style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            background: 'linear-gradient(180deg, #f8fafb 0%, #f0f4f6 100%)',
            borderRadius: '2px',
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid #e0e4e8',
            margin: '0 auto'
          }}>
            <svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
              {/* グリッド */}
              {[...Array(11)].map((_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 40} x2={canvasWidth} y2={i * 40} 
                  stroke="#dde2e6" strokeWidth="0.5" />
              ))}
              {[...Array(15)].map((_, i) => (
                <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={canvasHeight} 
                  stroke="#dde2e6" strokeWidth="0.5" />
              ))}

              {/* 目標の軌跡 */}
              {targetTrail.length > 1 && (
                <path
                  d={`M ${targetTrail.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  stroke="rgba(180, 60, 60, 0.15)"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="5,4"
                />
              )}

              {/* 過去のスナップショット */}
              {historicalSnapshots.map((snap, idx) => (
                <g key={idx} opacity={0.08 + idx * 0.04}>
                  <path
                    d={`M ${snap.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                    stroke="#d97706"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="4,4"
                  />
                </g>
              ))}

              {/* 誤差ベクトル（球→目標） */}
              {phase === 1 && (
                <line
                  x1={ballPos.x}
                  y1={ballPos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke="rgba(80, 80, 80, 0.2)"
                  strokeWidth="1.5"
                  strokeDasharray="4,3"
                />
              )}

              {/* 実際の軌跡 */}
              {trail.length > 1 && (
                <path
                  d={`M ${trail.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  stroke="#2563eb"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              )}

              {/* 球の向き（矢印）- 予測軌道より先に描画 */}
              <line
                x1={ballPos.x}
                y1={ballPos.y}
                x2={ballPos.x + Math.cos(ballAngle) * 35}
                y2={ballPos.y + Math.sin(ballAngle) * 35}
                stroke="#1d4ed8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <polygon
                points={`
                  ${ballPos.x + Math.cos(ballAngle) * 42},${ballPos.y + Math.sin(ballAngle) * 42}
                  ${ballPos.x + Math.cos(ballAngle - 0.5) * 30},${ballPos.y + Math.sin(ballAngle - 0.5) * 30}
                  ${ballPos.x + Math.cos(ballAngle + 0.5) * 30},${ballPos.y + Math.sin(ballAngle + 0.5) * 30}
                `}
                fill="#1d4ed8"
              />

              {/* 候補軌道（非最適）- 矢印の後に描画 */}
              {phase === 1 && candidatePaths.map((path, idx) => (
                path.length > 1 && (
                  <path
                    key={idx}
                    d={`M ${path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                    stroke="rgba(100, 100, 100, 0.4)"
                    strokeWidth="2.5"
                    fill="none"
                    strokeDasharray="4,4"
                  />
                )
              ))}

              {/* 最適予測軌道 - 最前面に描画 */}
              {optimalPath.length > 1 && phase === 1 && (
                <path
                  d={`M ${optimalPath.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  stroke="#d97706"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray="8,5"
                />
              )}
            </svg>

            {/* 目標点 */}
            <div style={{
              position: 'absolute',
              left: targetPos.x - 14,
              top: targetPos.y - 14,
              width: '28px',
              height: '28px',
              pointerEvents: 'none'
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                border: '3px solid #b43c3c',
                borderRadius: '50%',
                background: 'rgba(180, 60, 60, 0.12)'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '8px',
                  height: '8px',
                  background: '#b43c3c',
                  borderRadius: '50%'
                }} />
              </div>
            </div>

            {/* 球 */}
            <div style={{
              position: 'absolute',
              left: ballPos.x - 14,
              top: ballPos.y - 14,
              width: '28px',
              height: '28px',
              pointerEvents: 'none'
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                background: 'radial-gradient(circle at 40% 40%, #60a5fa, #2563eb)',
                borderRadius: '50%',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
              }} />
            </div>
          </div>

          {/* 凡例 */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            marginTop: '18px',
            fontSize: '11px',
            color: '#555',
            fontFamily: '"Noto Sans JP", sans-serif',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="28" height="12">
                <line x1="0" y1="6" x2="28" y2="6" stroke="#d97706" strokeWidth="3" strokeDasharray="5,3" />
              </svg>
              <span>予測最適軌道</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="28" height="12">
                <line x1="0" y1="6" x2="28" y2="6" stroke="rgba(100,100,100,0.5)" strokeWidth="2.5" strokeDasharray="4,3" />
              </svg>
              <span>候補軌道</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="28" height="12">
                <line x1="0" y1="6" x2="28" y2="6" stroke="#2563eb" strokeWidth="3" />
              </svg>
              <span>実軌跡</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="12">
                <line x1="2" y1="6" x2="14" y2="6" stroke="#1d4ed8" strokeWidth="2.5" />
                <polygon points="18,6 12,3 12,9" fill="#1d4ed8" />
              </svg>
              <span>進行可能方向</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '14px', height: '14px', border: '2px solid #b43c3c', borderRadius: '50%' }} />
              <span>移動目標</span>
            </div>
          </div>

          {/* コントロール */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '20px'
          }}>
            <button
              onClick={startAnimation}
              disabled={phase === 1}
              style={{
                padding: '10px 28px',
                fontSize: '13px',
                fontWeight: '500',
                background: phase === 1 ? '#ccc' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: phase === 1 ? 'not-allowed' : 'pointer',
                fontFamily: '"Noto Sans JP", sans-serif'
              }}
            >
              {phase === 0 ? '▶ 再生' : phase === 1 ? '実行中...' : '▶ 再実行'}
            </button>
            <button
              onClick={resetAnimation}
              style={{
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: '500',
                background: '#f5f5f5',
                color: '#555',
                border: '1px solid #ddd',
                borderRadius: '3px',
                cursor: 'pointer',
                fontFamily: '"Noto Sans JP", sans-serif'
              }}
            >
              リセット
            </button>
          </div>
        </div>

        {/* キャプション */}
        <div style={{
          padding: '18px 32px 22px',
          borderTop: '1px solid #e8e8e8',
          background: '#fafafa'
        }}>
          <p style={{
            fontSize: '11.5px',
            lineHeight: '1.95',
            color: '#555',
            margin: 0,
            fontFamily: '"Noto Sans JP", sans-serif',
            textAlign: 'justify'
          }}>
            <strong>図1.</strong> 横滑りできない車輪（unicycle）型の運動制約をもつ点（青）が、動く目標（赤）を追従する様子。橙は各時刻 t に解き直した予測最適軌道（有限ホライズンのコスト最小化）、灰色は他の候補軌道、青はそのとき実際に実行した軌跡である。毎時刻、目標との差（誤差）を観測して最適化を更新し続ける——この逐次的な解き直しにより、フィードバック制御は「時間発展する変分最適化をオンラインで解いている」と見なせる。
          </p>
        </div>
      </div>
    </div>
  );
};

export default OnlineVariationalAnimation;
