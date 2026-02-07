/**
 * src/animations/ 内の .jsx を自動収集し、一覧を返します。
 * 新規アニメを追加する場合は、このフォルダに .jsx を置き、
 * ファイル内で animationMeta を export してください。
 */
const modules = import.meta.glob('./*.jsx', { eager: true });

export const ANIMATIONS = Object.entries(modules)
  .filter(([path]) => !path.includes('index'))
  .map(([path, mod]) => {
    const meta = mod.animationMeta || {};
    const id = meta.id ?? path.replace(/^\.\/(.+)\.jsx$/, '$1');
    const label = meta.label ?? id;
    return {
      id,
      label,
      Component: mod.default,
    };
  })
  .filter((entry) => entry.Component);
