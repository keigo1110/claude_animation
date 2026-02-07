# アニメーションの追加方法

このフォルダに **React コンポーネントの .jsx ファイル** を置くと、画面上の一覧に自動で追加されます。

## 手順

1. Claude などで作成したアニメーションの `.jsx` をこのフォルダに保存する。
2. ファイル内で次の2つを export する：
   - **default**: React コンポーネント（表示されるアニメ本体）
   - **animationMeta**（任意）: 一覧用の id と label

## 例

```jsx
import React, { useState } from 'react';

export const animationMeta = {
  id: 'my-demo',
  label: 'マイデモのタイトル',
};

export default function MyDemo() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
    </div>
  );
}
```

- `animationMeta` を書かない場合、ファイル名（拡張子除く）が id と label の代わりに使われます。
- 既存ファイル（NeuralNetworkComparison.jsx, OnlineVariationalAnimation.jsx）を参考にしてください。
