import React, { useState } from 'react';
import { ANIMATIONS } from './animations';

export default function App() {
  const [currentId, setCurrentId] = useState(() => ANIMATIONS[0]?.id ?? '');
  const current = ANIMATIONS.find((a) => a.id === currentId);
  const CurrentComponent = current?.Component;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '12px 24px',
          background: '#1a1a1a',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#aaa', fontSize: '14px', fontWeight: 600 }}>アニメーション例</span>
        <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ANIMATIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCurrentId(id)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                background: currentId === id ? '#3b82f6' : 'transparent',
                color: currentId === id ? '#fff' : '#aaa',
                border: `1px solid ${currentId === id ? '#3b82f6' : '#444'}`,
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ flex: 1 }}>
        {ANIMATIONS.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#888' }}>
            src/animations/ に .jsx を追加してください。README を参照してください。
          </div>
        ) : CurrentComponent ? (
          <CurrentComponent />
        ) : null}
      </main>
    </div>
  );
}
