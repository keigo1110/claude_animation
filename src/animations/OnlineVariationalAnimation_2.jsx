import React, { useState, useEffect, useRef, useCallback } from 'react';

/** 一覧に表示するためのメタ情報（新規アニメ追加時は id と label を設定） */
export const animationMeta = {
  id: 'variational-2',
  label: 'オンライン変分最適化 2（MPC追従）',
};

const STEP_LABELS = [
  '0. 灰色破線なし',
  '1. 複数の候補軌道（灰色破線）を列挙する',
  '2. 最もコストの低い予測軌道を評価する',
  '3. 評価した軌道に沿って進む（1歩を大きく見せる）',
  '4. 進んだ現在位置と目標位置の差分を検知する'
];

const computeTargetPosition = (t) => {
  const centerX = 380;
  const centerY = 200;
  const radiusX = 140;
  const radiusY = 90;
  const speed = 0.014;
  return {
    x: centerX + radiusX * Math.cos(t * speed - Math.PI / 2),
    y: centerY + radiusY * Math.sin(t * speed - Math.PI / 2)
  };
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

  /** 'global' = 大域表示, 'stepDetail' = ステップ詳細（拡大・ゆっくり） */
  const [viewMode, setViewMode] = useState('stepDetail');
  const [stepDetailState, setStepDetailState] = useState({ x: 80, y: 320, theta: -Math.PI / 5 });
  const [stepDetailT, setStepDetailT] = useState(0);
  const [stepDetailSubStep, setStepDetailSubStep] = useState(0);
  const [stepDetailAutoAdvance, setStepDetailAutoAdvance] = useState(false);
  const [stepDetailPrevMpc, setStepDetailPrevMpc] = useState(null);
  const [stepDetailTrail, setStepDetailTrail] = useState([{ x: 80, y: 320 }]);
  const [stepDetailTargetTrail, setStepDetailTargetTrail] = useState([computeTargetPosition(0)]);
  const stepDetailAutoRef = useRef(null);
  
  const animationRef = useRef(null);
  const stateRef = useRef({ x: 80, y: 320, theta: -Math.PI / 5 });
  const timeRef = useRef(0);
  
  const canvasWidth = 580;
  const canvasHeight = 400;
  
  // パラメータ
  const velocity = 2.2;
  const horizon = 22; // 長めのホライズン
  const lambda = 0.3;

  const getTargetPosition = useCallback((t) => computeTargetPosition(t), []);

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

  // 目標: 200フレーム程度の到達を10フレーム相当に圧縮（約20倍速）
  const stepDetailAdvanceSteps = 20;

  const advanceStateBySteps = useCallback((startState, omega, steps) => {
    let x = startState.x;
    let y = startState.y;
    let theta = startState.theta;
    for (let i = 0; i < steps; i += 1) {
      theta += omega;
      x += velocity * Math.cos(theta);
      y += velocity * Math.sin(theta);
    }
    return { x, y, theta };
  }, [velocity]);

  const stepDetailStep3EndState = (() => {
    if (viewMode !== 'stepDetail' || stepDetailSubStep !== 3) return null;
    const mpcResult = solveMPC(stepDetailState, stepDetailT, getTargetPosition);
    const omega = mpcResult.optimal.firstOmega;
    return advanceStateBySteps(stepDetailState, omega, stepDetailAdvanceSteps);
  })();

  const stepDetailLatestTarget = stepDetailTargetTrail[stepDetailTargetTrail.length - 1]
    || getTargetPosition(stepDetailT);

  // ステップ詳細モード: 表示用の球位置（subStep 3 は起点に固定）
  const stepDetailDisplayState = (() => {
    if (viewMode !== 'stepDetail') return stepDetailState;
    if (stepDetailSubStep === 3) return stepDetailState;
    return stepDetailState;
  })();

  // ステップ詳細モード: 現在の (stepDetailState, stepDetailT) での MPC 結果
  const stepDetailMpcResult = viewMode === 'stepDetail'
    ? solveMPC(stepDetailState, stepDetailT, getTargetPosition)
    : null;

  const advanceStepDetail = useCallback(() => {
    if (stepDetailSubStep < 3) {
      setStepDetailSubStep(s => s + 1);
      return;
    }
    if (stepDetailSubStep === 3) {
      const mpcResult = solveMPC(stepDetailState, stepDetailT, getTargetPosition);
      const omega = mpcResult.optimal.firstOmega;
      const newState = advanceStateBySteps(stepDetailState, omega, stepDetailAdvanceSteps);
      const newTarget = getTargetPosition(stepDetailT + stepDetailAdvanceSteps);
      const dist = Math.hypot(newTarget.x - newState.x, newTarget.y - newState.y);
      setStepDetailPrevMpc(mpcResult);
      setStepDetailTrail(prev => [...prev.slice(-500), { x: newState.x, y: newState.y }]);
      setStepDetailTargetTrail(prev => [...prev.slice(-150), { ...newTarget }]);
      if (dist < 20) {
        setStepDetailSubStep(1);
        setStepDetailState(newState);
        setStepDetailT(t => t + stepDetailAdvanceSteps);
        return;
      }
      setStepDetailState(newState);
      setStepDetailT(t => t + stepDetailAdvanceSteps);
      setStepDetailSubStep(4);
      return;
    }
    if (stepDetailSubStep === 4) {
      setStepDetailSubStep(1);
      return;
    }
  }, [
    stepDetailSubStep,
    stepDetailState,
    stepDetailT,
    solveMPC,
    getTargetPosition,
    advanceStateBySteps,
    stepDetailAdvanceSteps
  ]);

  useEffect(() => {
    if (viewMode !== 'stepDetail' || !stepDetailAutoAdvance) return;
    // フレーム進行はゆっくり見せる
    const id = setTimeout(advanceStepDetail, 300);
    stepDetailAutoRef.current = id;
    return () => clearTimeout(id);
  }, [viewMode, stepDetailAutoAdvance, stepDetailSubStep, stepDetailState, stepDetailT, advanceStepDetail]);

  const resetStepDetail = useCallback(() => {
    setStepDetailState({ x: 80, y: 320, theta: -Math.PI / 5 });
    setStepDetailT(0);
    setStepDetailSubStep(0);
    setStepDetailPrevMpc(null);
    setStepDetailTrail([{ x: 80, y: 320 }]);
    setStepDetailTargetTrail([getTargetPosition(0)]);
  }, []);

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
        maxWidth: '1280px'
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

        {/* キャンバス: 左=拡大表示 / 右=大域表示 */}
        <div style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'flex-start' }}>
            {/* 左: 拡大表示 */}
            <div style={{ width: `${canvasWidth}px` }}>
              <div style={{
                marginBottom: '12px',
                padding: '10px 16px',
                background: '#f0f4f8',
                borderRadius: '3px',
                borderLeft: '4px solid #2563eb',
                fontSize: '13px',
                color: '#333',
                fontFamily: '"Noto Sans JP", sans-serif'
              }}>
                <span style={{ fontWeight: '600', marginRight: '8px' }}>拡大表示｜ステップ {stepDetailSubStep}/4:</span>
                {STEP_LABELS[stepDetailSubStep]}
              </div>
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
                <svg
                  style={{ position: 'absolute', width: '100%', height: '100%' }}
                  viewBox={(() => {
                    const ball = stepDetailDisplayState;
                    const cx = ball.x;
                    const cy = ball.y;
                    const size = 200;
                    return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
                  })()}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* グリッド */}
                  {(() => {
                    const ball = stepDetailDisplayState;
                    const cx = ball.x;
                    const cy = ball.y;
                    const half = 100;
                    const step = 10;
                    const count = Math.ceil((half * 2) / step) + 1;
                    return (
                      <>
                        {[...Array(count)].map((_, i) => (
                          <line key={`h${i}`} x1={cx - half} y1={cy - half + i * step} x2={cx + half} y2={cy - half + i * step}
                            stroke="#dde2e6" strokeWidth="0.5" />
                        ))}
                        {[...Array(count)].map((_, i) => (
                          <line key={`v${i}`} x1={cx - half + i * step} y1={cy - half} x2={cx - half + i * step} y2={cy + half}
                            stroke="#dde2e6" strokeWidth="0.5" />
                        ))}
                      </>
                    );
                  })()}

                  {/* 誤差ベクトル（球→目標） */}
                  {stepDetailSubStep === 4 && (
                    <line
                      x1={stepDetailDisplayState.x}
                      y1={stepDetailDisplayState.y}
                      x2={getTargetPosition(stepDetailT).x}
                      y2={getTargetPosition(stepDetailT).y}
                      stroke="#64748b"
                      strokeWidth="4"
                      strokeDasharray="6,4"
                    />
                  )}

                  {/* ステップ3: 進んだ区間を強調 */}
                  {stepDetailSubStep === 3 && stepDetailMpcResult && stepDetailStep3EndState && (
                    <>
                      <line
                        x1={stepDetailState.x}
                        y1={stepDetailState.y}
                        x2={stepDetailStep3EndState.x}
                        y2={stepDetailStep3EndState.y}
                        stroke="#16a34a"
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                      <line
                        x1={stepDetailState.x}
                        y1={stepDetailState.y}
                        x2={stepDetailStep3EndState.x}
                        y2={stepDetailStep3EndState.y}
                        stroke="#22c55e"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      <circle cx={stepDetailState.x} cy={stepDetailState.y} r="14" fill="rgba(34, 197, 94, 0.25)" stroke="#16a34a" strokeWidth="2" strokeDasharray="4,3" />
                      <circle cx={stepDetailState.x} cy={stepDetailState.y} r="5" fill="#16a34a" opacity="0.6" />
                    </>
                  )}

                  {/* 矢印（起点固定） */}
                  <line
                    x1={stepDetailDisplayState.x}
                    y1={stepDetailDisplayState.y}
                    x2={stepDetailDisplayState.x + Math.cos(stepDetailDisplayState.theta) * 35}
                    y2={stepDetailDisplayState.y + Math.sin(stepDetailDisplayState.theta) * 35}
                    stroke="#1d4ed8"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <polygon
                    points={`
                      ${stepDetailDisplayState.x + Math.cos(stepDetailDisplayState.theta) * 42},${stepDetailDisplayState.y + Math.sin(stepDetailDisplayState.theta) * 42}
                      ${stepDetailDisplayState.x + Math.cos(stepDetailDisplayState.theta - 0.5) * 30},${stepDetailDisplayState.y + Math.sin(stepDetailDisplayState.theta - 0.5) * 30}
                      ${stepDetailDisplayState.x + Math.cos(stepDetailDisplayState.theta + 0.5) * 30},${stepDetailDisplayState.y + Math.sin(stepDetailDisplayState.theta + 0.5) * 30}
                    `}
                    fill="#1d4ed8"
                  />

                  {/* 候補軌道 */}
                  {stepDetailMpcResult && [1, 2].includes(stepDetailSubStep) && (
                    <>
                      {stepDetailSubStep === 1 && [stepDetailMpcResult.optimal, ...stepDetailMpcResult.candidates].map((c, idx) => (
                        c.path.length > 1 && (
                          <path
                            key={idx}
                            d={`M ${c.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                            stroke="rgba(100, 100, 100, 0.5)"
                            strokeWidth="3"
                            fill="none"
                            strokeDasharray="4,4"
                          />
                        )
                      ))}
                      {stepDetailSubStep === 2 && stepDetailMpcResult.candidates.map((c, idx) => (
                        c.path.length > 1 && (
                          <path
                            key={idx}
                            d={`M ${c.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                            stroke="rgba(100, 100, 100, 0.5)"
                            strokeWidth="3"
                            fill="none"
                            strokeDasharray="4,4"
                          />
                        )
                      ))}
                    </>
                  )}

                  {/* 最適予測軌道 */}
                  {stepDetailMpcResult && (stepDetailSubStep === 2 || stepDetailSubStep === 3) && stepDetailMpcResult.optimal.path.length > 1 && (
                    <path
                      d={`M ${stepDetailMpcResult.optimal.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                      stroke="#d97706"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray="8,5"
                    />
                  )}

                  {/* 目標（SVG） */}
                  <circle cx={getTargetPosition(stepDetailT).x} cy={getTargetPosition(stepDetailT).y} r="14" fill="rgba(180, 60, 60, 0.15)" stroke="#b43c3c" strokeWidth="3" />
                  <circle cx={getTargetPosition(stepDetailT).x} cy={getTargetPosition(stepDetailT).y} r="4" fill="#b43c3c" />

                  {/* 球（SVG） */}
                  <circle cx={stepDetailDisplayState.x} cy={stepDetailDisplayState.y} r="14" fill="#2563eb" stroke="#1d4ed8" strokeWidth="2" />
                </svg>
              </div>

              {/* ステップ詳細コントロール */}
              <div style={{ display: 'grid', gap: '10px', justifyContent: 'center', marginTop: '16px', gridTemplateColumns: 'auto auto auto' }}>
                <button
                  onClick={advanceStepDetail}
                  style={{
                    padding: '10px 24px',
                    fontSize: '13px',
                    fontWeight: '500',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontFamily: '"Noto Sans JP", sans-serif'
                  }}
                >
                  次へ（1ステップ進める）
                </button>
                <button
                  onClick={() => setStepDetailAutoAdvance(a => !a)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: '500',
                    background: stepDetailAutoAdvance ? '#16a34a' : '#f0f0f0',
                    color: stepDetailAutoAdvance ? 'white' : '#555',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontFamily: '"Noto Sans JP", sans-serif',
                    minWidth: '220px',
                    textAlign: 'center'
                  }}
                >
                  {stepDetailAutoAdvance ? '■ 自動を止める' : '▶ 自動で進む（約3秒ごと）'}
                </button>
                <button
                  onClick={resetStepDetail}
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    background: '#f5f5f5',
                    color: '#555',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontFamily: '"Noto Sans JP", sans-serif'
                  }}
                >
                  ステップを最初から
                </button>
              </div>
            </div>

            {/* 右: 大域表示（同じロジックの状態を全体視で描画） */}
            <div style={{ width: `${canvasWidth}px` }}>
              <div style={{
                marginBottom: '12px',
                padding: '10px 16px',
                background: '#fafafa',
                borderRadius: '3px',
                borderLeft: '4px solid #b43c3c',
                fontSize: '13px',
                color: '#333',
                fontFamily: '"Noto Sans JP", sans-serif'
              }}>
                <span style={{ fontWeight: '600' }}>対極的大域表示</span>
              </div>
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
                  {[...Array(11)].map((_, i) => (
                    <line key={`h${i}`} x1="0" y1={i * 40} x2={canvasWidth} y2={i * 40}
                      stroke="#dde2e6" strokeWidth="0.5" />
                  ))}
                  {[...Array(15)].map((_, i) => (
                    <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={canvasHeight}
                      stroke="#dde2e6" strokeWidth="0.5" />
                  ))}

                  {stepDetailTargetTrail.length > 1 && (
                    <path
                      d={`M ${stepDetailTargetTrail.map(p => `${p.x},${p.y}`).join(' L ')}`}
                      stroke="rgba(180, 60, 60, 0.15)"
                      strokeWidth="2"
                      fill="none"
                      strokeDasharray="5,4"
                    />
                  )}

                  {stepDetailSubStep > 0 && (
                    <line
                      x1={stepDetailState.x}
                      y1={stepDetailState.y}
                      x2={stepDetailLatestTarget.x}
                      y2={stepDetailLatestTarget.y}
                      stroke="rgba(80, 80, 80, 0.2)"
                      strokeWidth="1.5"
                      strokeDasharray="4,3"
                    />
                  )}

                  {stepDetailTrail.length > 1 && (
                    <path
                      d={`M ${stepDetailTrail.map(p => `${p.x},${p.y}`).join(' L ')}`}
                      stroke="#2563eb"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                  )}

                  <line
                    x1={stepDetailState.x}
                    y1={stepDetailState.y}
                    x2={stepDetailState.x + Math.cos(stepDetailState.theta) * 35}
                    y2={stepDetailState.y + Math.sin(stepDetailState.theta) * 35}
                    stroke="#1d4ed8"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <polygon
                    points={`
                      ${stepDetailState.x + Math.cos(stepDetailState.theta) * 42},${stepDetailState.y + Math.sin(stepDetailState.theta) * 42}
                      ${stepDetailState.x + Math.cos(stepDetailState.theta - 0.5) * 30},${stepDetailState.y + Math.sin(stepDetailState.theta - 0.5) * 30}
                      ${stepDetailState.x + Math.cos(stepDetailState.theta + 0.5) * 30},${stepDetailState.y + Math.sin(stepDetailState.theta + 0.5) * 30}
                    `}
                    fill="#1d4ed8"
                  />

                  {stepDetailMpcResult && [1, 2].includes(stepDetailSubStep) && stepDetailMpcResult.candidates.map((c, idx) => (
                    c.path.length > 1 && (
                      <path
                        key={idx}
                        d={`M ${c.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                        stroke="rgba(100, 100, 100, 0.4)"
                        strokeWidth="2.5"
                        fill="none"
                        strokeDasharray="4,4"
                      />
                    )
                  ))}

                  {stepDetailMpcResult && (stepDetailSubStep === 2 || stepDetailSubStep === 3) && stepDetailMpcResult.optimal.path.length > 1 && (
                    <path
                      d={`M ${stepDetailMpcResult.optimal.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                      stroke="#d97706"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray="8,5"
                    />
                  )}

                  {/* 目標（SVG） */}
                  <circle cx={stepDetailLatestTarget.x} cy={stepDetailLatestTarget.y} r="14" fill="rgba(180, 60, 60, 0.12)" stroke="#b43c3c" strokeWidth="3" />
                  <circle cx={stepDetailLatestTarget.x} cy={stepDetailLatestTarget.y} r="4" fill="#b43c3c" />
                </svg>

                {/* 球 */}
                <div style={{
                  position: 'absolute',
                  left: stepDetailState.x - 14,
                  top: stepDetailState.y - 14,
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

              {/* 大域表示は左の操作と同期 */}
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
