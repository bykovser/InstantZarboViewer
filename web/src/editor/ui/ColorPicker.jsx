import { useEffect, useRef, useState } from 'preact/hooks';
import { Color, SRGBColorSpace } from 'three';

import { blackbodyLinear } from '../blackbody.js';

const _c = new Color();

// value/onInput in `space`: 'linear' (glTF factors) or 'srgb' (UI colors like the background).
export const toSRGB = (rgb, space) => (space === 'srgb' ? rgb : (_c.setRGB(...rgb), _c.getRGB(new Color(), SRGBColorSpace).toArray()));
const fromSRGB = (rgb, space) => (space === 'srgb' ? rgb : (_c.setRGB(...rgb, SRGBColorSpace), [_c.r, _c.g, _c.b]));

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;
const parseHex = (s) => {
  const m = s.trim().replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

const KELVIN_GRADIENT = `linear-gradient(to right, ${[1000, 2000, 3000, 4000, 5000, 6000, 7000, 8500, 10000, 12000]
  .map((k) => toHex(toSRGB(blackbodyLinear(k), 'linear'))).join(', ')})`;

function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

function hsvToRgb([h, s, v]) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

function useDrag(onMove) {
  return (e) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      onMove(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height));
    };
    move(e);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
}

function NumberBox({ value, min = 0, max, suffix = '', onChange }) {
  return (
    <label class="cp-num">
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

function Popover({ srgb, onChange, swatches, onClose, anchor }) {
  const ref = useRef();
  // HSV is kept locally so hue survives grey/black colors.
  const [hsv, setHsv] = useState(() => rgbToHsv(srgb));
  const [hexText, setHexText] = useState(toHex(srgb));

  useEffect(() => {
    const out = (e) => !ref.current?.contains(e.target) && !anchor.current?.contains(e.target) && onClose();
    const esc = (e) => e.key === 'Escape' && onClose();
    addEventListener('pointerdown', out, true);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', out, true);
      removeEventListener('keydown', esc);
    };
  }, []);

  const commitHsv = (next) => {
    setHsv(next);
    const rgb = hsvToRgb(next);
    setHexText(toHex(rgb));
    onChange(rgb);
  };
  const commitRgb = (rgb) => {
    setHsv(rgbToHsv(rgb));
    setHexText(toHex(rgb));
    onChange(rgb);
  };

  const [kelvin, setKelvin] = useState(6500);
  const applyKelvin = (k) => {
    setKelvin(k);
    const [h, s] = rgbToHsv(toSRGB(blackbodyLinear(k), 'linear'));
    commitHsv([h, s, hsv[2] || 1]);
  };

  const onSV = useDrag((x, y) => commitHsv([hsv[0], x, 1 - y]));
  const onHue = useDrag((x) => commitHsv([x * 360, hsv[1], hsv[2]]));
  const rgb = hsvToRgb(hsv);

  const pickScreen = async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      commitRgb(parseHex(sRGBHex));
    } catch { /* cancelled */ }
  };

  // Keep inside the viewport: the inspector sits at the right edge.
  const rect = anchor.current.getBoundingClientRect();
  const style = { top: Math.max(8, Math.min(rect.bottom + 4, innerHeight - 400)), left: Math.max(8, Math.min(rect.left, innerWidth - 260)) };

  return (
    <div class="cp" ref={ref} style={style}>
      <div class="cp-sv" style={{ backgroundColor: `hsl(${hsv[0]} 100% 50%)` }} onPointerDown={onSV}>
        <div class="cp-thumb" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: toHex(rgb) }} />
      </div>
      <div class="cp-hue" onPointerDown={onHue}>
        <div class="cp-thumb" style={{ left: `${(hsv[0] / 360) * 100}%`, top: '50%' }} />
      </div>
      <div class="cp-grid">
        <span class="cp-label">HEX</span>
        <span class="cp-row">
          <input
            class="cp-hex" value={hexText}
            onInput={(e) => {
              setHexText(e.currentTarget.value);
              const p = parseHex(e.currentTarget.value);
              if (p) commitRgb(p);
            }}
          />
          {'EyeDropper' in window && <button title="Пипетка с экрана" onClick={pickScreen}>⌖ пипетка</button>}
        </span>

        <span class="cp-label">RGB</span>
        <span class="cp-row">
          {[0, 1, 2].map((i) => (
            <NumberBox
              value={Math.round(rgb[i] * 255)} max={255}
              onChange={(v) => {
                const next = [...rgb];
                next[i] = clamp01(v / 255);
                commitRgb(next);
              }}
            />
          ))}
        </span>

        <span class="cp-label">HSV</span>
        <span class="cp-row">
          <NumberBox value={Math.round(hsv[0])} max={360} suffix="°" onChange={(v) => commitHsv([v % 360, hsv[1], hsv[2]])} />
          <NumberBox value={Math.round(hsv[1] * 100)} max={100} suffix="%" onChange={(v) => commitHsv([hsv[0], v / 100, hsv[2]])} />
          <NumberBox value={Math.round(hsv[2] * 100)} max={100} suffix="%" onChange={(v) => commitHsv([hsv[0], hsv[1], v / 100])} />
        </span>

        <span class="cp-label" title="Цветовая температура (blackbody), яркость V сохраняется">K</span>
        <span class="cp-row">
          <input
            type="range" class="cp-kelvin" min={1000} max={12000} step={50} value={kelvin}
            style={{ background: KELVIN_GRADIENT }}
            onInput={(e) => applyKelvin(Number(e.currentTarget.value))}
          />
          <NumberBox value={kelvin} min={800} max={40000} onChange={applyKelvin} />
        </span>
      </div>
      {swatches.length > 0 && (
        <div class="cp-swatches">
          {swatches.map((s) => <button class="cp-swatch" style={{ background: s }} title={s} onClick={() => commitRgb(parseHex(s))} />)}
        </div>
      )}
    </div>
  );
}

const recent = [];

// variant 'thumb': the trigger is a texture-slot tile (empty slot = factor color).
export function ColorPicker({ value, onInput, space = 'linear', swatches = [], variant = 'field', title }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef();
  const srgb = toSRGB(value ?? [1, 1, 1], space);
  const hex = toHex(srgb);

  const close = () => {
    setOpen(false);
    const i = recent.indexOf(hex);
    if (i >= 0) recent.splice(i, 1);
    recent.unshift(hex);
    recent.length = Math.min(recent.length, 8);
  };

  const toggle = () => (open ? close() : setOpen(true));
  return (
    <span class={variant === 'thumb' ? 'cp-thumb-wrap' : 'cp-field'}>
      {variant === 'thumb'
        ? <button ref={anchor} class="slot-thumb slot-color" style={{ background: hex }} title={title} onClick={toggle} />
        : <>
          <button ref={anchor} class="cp-button" style={{ background: hex }} onClick={toggle} />
          <span class="mono muted">{hex}</span>
        </>}
      {open && (
        <Popover
          srgb={srgb} anchor={anchor} onClose={close}
          swatches={[...new Set([...recent, ...swatches])].slice(0, 16)}
          onChange={(rgb) => onInput(fromSRGB(rgb, space))}
        />
      )}
    </span>
  );
}
