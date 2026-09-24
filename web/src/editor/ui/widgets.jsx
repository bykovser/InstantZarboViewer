import { useState } from 'preact/hooks';
import { Color, SRGBColorSpace } from 'three';

const _c = new Color();

// glTF factors are linear; the color picker works in sRGB hex.
export const linearToHex = (rgb) => `#${_c.setRGB(...rgb).getHexString(SRGBColorSpace)}`;
export const hexToLinear = (hex) => {
  _c.setStyle(hex, SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
};

const round = (v, step) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(v.toFixed(digits));
};

export function Row({ label, children, title }) {
  return (
    <label class="row" title={title}>
      <span class="row-label">{label}</span>
      <span class="row-control">{children}</span>
    </label>
  );
}

export function Slider({ value, min, max, step = 0.01, onInput }) {
  const v = value ?? 0;
  return (
    <span class="slider">
      <input type="range" min={min} max={max} step={step} value={v} onInput={(e) => onInput(Number(e.currentTarget.value))} />
      <input
        type="number" step={step} value={round(v, step)}
        onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isFinite(n)) onInput(n);
        }}
      />
    </span>
  );
}

export function ColorInput({ value, onInput }) {
  return <input type="color" value={linearToHex(value ?? [1, 1, 1])} onInput={(e) => onInput(hexToLinear(e.currentTarget.value))} />;
}

export function Select({ value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      {options.map((o) => (typeof o === 'string' ? <option value={o}>{o}</option> : <option value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Section({ title, open: initial = true, header, children }) {
  const [open, setOpen] = useState(initial);
  return (
    <section class={`section ${open ? 'open' : ''}`}>
      <div class="section-head">
        <button class="section-toggle" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {title}</button>
        {header}
      </div>
      {open && <div class="section-body">{children}</div>}
    </section>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div class="tabs">
      {tabs.map((t) => (
        <button class={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
