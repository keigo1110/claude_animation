# アニメーションビューア

Claude などで作成した React アニメーションをローカルで一覧・切り替え表示するためのプロジェクトです。

## ディレクトリ構成

```
animation/
├── index.html           # エントリーHTML
├── package.json
├── vite.config.js
├── README.md            # 本ファイル
└── src/
    ├── main.jsx         # React マウント
    ├── App.jsx          # 一覧ヘッダーとアニメ切り替えUI
    └── animations/      # アニメーションコンポーネント置き場
        ├── index.js     # 一覧の自動収集（編集不要）
        ├── NeuralNetworkComparison.jsx
        └── OnlineVariationalAnimation.jsx
```

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173/ を開き、ヘッダーのボタンでアニメを切り替えて表示できます。

## 新しいアニメーションの追加方法（拡張）

1. **ファイルを置く**  
   Claude などでダウンロードした `.jsx` を `src/animations/` に配置する。

2. **メタ情報を export する**  
   そのファイルの先頭付近で、一覧に表示するための情報を export する。

   ```jsx
   import React from 'react';

   /** 一覧に表示するためのメタ情報 */
   export const animationMeta = {
     id: 'my-animation',        // 一意のID（英数字・ハイフン推奨）
     label: 'マイアニメの名前',  // 画面上のボタンに表示される名前
   };

   export default function MyAnimation() {
     return <div>...</div>;
   }
   ```

3. **保存して確認**  
   `npm run dev` 実行中なら、一覧に自動で追加され、ボタンから選択して表示できます。

- **注意**: `animationMeta` を export しない場合、ファイル名が id 兼 label の代わりに使われます。
- **注意**: `default` で React コンポーネントを export してください。

## ビルド・プレビュー

```bash
npm run build   # dist/ に静的ファイルを出力
npm run preview # ビルド結果をローカルでプレビュー
```
