import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MachGLMapComponent = typeof import('./MachGLMap').default;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machGLScript = () => document.head.querySelector<HTMLScriptElement>('script[src^="https://cdn.geolonia.com/machgl/"]');

// 読み込み中の状態はモジュールが持つので、テストごとに読み直して前のテストの状態を持ち込まない
let MachGLMap: MachGLMapComponent;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

const render = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MachGLMap
        style="geolonia/basic-v2"
        lang="auto"
        stage="v1"
        center={[139.767, 35.681]}
        zoom={16}
        transformRequest={(url) => ({ url })}
        onLoad={() => undefined}
      >
        <button type="button">MapLibre</button>
      </MachGLMap>,
    );
  });
  return container;
};

beforeEach(async () => {
  vi.resetModules();
  MachGLMap = (await import('./MachGLMap')).default;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  machGLScript()?.remove();
  delete window.MachGL;
});

describe('MachGLMap', () => {
  it('loads MachGL from the CDN with a script element', async () => {
    await render();
    expect(machGLScript()?.src).toBe('https://cdn.geolonia.com/machgl/main/?geolonia-api-key=YOUR-API-KEY');
  });

  it('keeps its children on screen when MachGL cannot be loaded, so the renderer can be switched back', async () => {
    const view = await render();
    await act(async () => {
      machGLScript()?.dispatchEvent(new Event('error'));
    });
    expect(view.querySelector('[role=alert]')?.textContent).toContain('MachGL を読み込めませんでした');
    expect(view.querySelector('button')?.textContent).toBe('MapLibre');
  });

  it('tries to load MachGL again after a failed attempt', async () => {
    await render();
    await act(async () => {
      machGLScript()?.dispatchEvent(new Event('error'));
    });
    expect(machGLScript()).toBeNull();

    await act(async () => root?.unmount());
    await render();
    expect(machGLScript()).not.toBeNull();
  });

  it('keeps its children on screen and stops the MachGL overlay when the map cannot be created', async () => {
    const options: object[] = [];
    window.MachGL = {
      Map: class {
        constructor(opts: object) {
          options.push(opts);
          throw new Error('WebGL2 is not supported');
        }
      },
    } as unknown as NonNullable<Window['MachGL']>;
    const view = await render();
    await act(async () => {
      machGLScript()?.dispatchEvent(new Event('load'));
    });
    expect(options).toEqual([ expect.objectContaining({ errorMessage: false, stage: 'v1' }) ]);
    expect(view.querySelector('[role=alert]')?.textContent).toContain('MachGL で地図を表示できませんでした');
    expect(view.querySelector('button')?.textContent).toBe('MapLibre');
  });
});
