import React from 'react';
import { Text, TextInput } from 'react-native';

// Global UPPERCASE-on-display policy for the mobile app.
//
// Why a render-patch instead of `Text.defaultProps`:
//   React's defaultProps semantics REPLACE — they don't merge. When a
//   caller does `<Text style={themeStyle}>` (which most screens do),
//   `Text.defaultProps.style` is shadowed entirely. RN also has no CSS
//   cascade equivalent, so we can't rely on a stylesheet like the web app
//   does. To apply the global policy without editing every call site we
//   wrap the internal render method once at boot and prepend
//   `textTransform: 'uppercase'` to the style chain. Per-element styles
//   still win (RN style arrays merge left-to-right, last value wins), so
//   any element that explicitly sets `textTransform: 'none'` (e.g. via
//   <PreserveCase>) gets its original case back.
//
// Call once, at the very top of App.tsx (before any Text/TextInput
// mounts). Idempotent — a second call is a no-op.

type RenderFn = (props: unknown, ref: unknown) => React.ReactElement | null;

interface Patchable {
  render?: RenderFn;
  __uppercasePatched?: boolean;
}

const UPPER_STYLE = { textTransform: 'uppercase' as const };

function patch(component: unknown): void {
  const c = component as Patchable;
  if (!c || typeof c.render !== 'function' || c.__uppercasePatched) {
    return;
  }
  const original = c.render;
  c.render = function patched(props, ref) {
    const elem = original.call(this, props, ref);
    if (!elem || typeof elem !== 'object') {
      return elem;
    }
    const existing = (elem.props as { style?: unknown }).style;
    return React.cloneElement(elem as React.ReactElement<{ style?: unknown }>, {
      style: [UPPER_STYLE, existing] as unknown as React.CSSProperties,
    });
  };
  c.__uppercasePatched = true;
}

export function installUppercaseDefaults(): void {
  patch(Text);
  patch(TextInput);
}
