export interface CtxCall {
  name: string;
  args: unknown[];
}

/**
 * A 2D context that records every method call and property assignment, so renderer code can be
 * tested without a real canvas (jsdom has none).
 */
export function createCanvasStub() {
  const calls: CtxCall[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_target, key: string) {
      if (key in props) return props[key];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
      };
    },
    set(_target, key: string, value) {
      props[key] = value;
      calls.push({ name: `set:${key}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, props };
}
