'use client';
import { Check, Colour, EffectFields, GradientStops, Group, Num } from './CharacterPanel';
import { Segmented } from './Segmented';
import { ARROWS, LINE_CAPS, SHAPES, STROKE_POS, type ShapeSpec } from '@/lib/shapes';
import type { Effects, TextStyle } from '@/lib/text-style';

const CORNERS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

/** A shape's fields (ROADMAP 38.7 c): type, corners, line ends, polygon / star points, fill, stroke and the shared shadow / glow effects. Shared by the Overlay Editor and the card back editor. */
export function ShapeFields({ spec, fx, set }: { spec: ShapeSpec; fx: Effects; set: (patch: Record<string, unknown>) => void }) {
  const f = spec.fill;
  const setStroke = (p: Partial<ShapeSpec['stroke']>) => set({ stroke: { ...spec.stroke, ...p } });
  return (
    <>
      <Segmented label="Shape" value={spec.shape} onChange={v => set({ shape: v })} options={SHAPES.map(s => ({ id: s, label: s }))} />
      {spec.shape === 'rect' && (
        <Group title="Corners">
          <Check label="Link corners" on={spec.radii.length === 0} onChange={v => set({ radii: v ? [] : [spec.radius, spec.radius, spec.radius, spec.radius] })} />
          {spec.radii.length === 0
            ? <Num label="Radius" value={spec.radius} min={0} max={1000} onChange={v => set({ radius: v })} />
            : CORNERS.map((c, i) => <Num key={c} label={c} value={spec.radii[i]} min={0} max={1000} onChange={v => set({ radii: spec.radii.map((x, k) => (k === i ? v : x)) })} />)}
        </Group>
      )}
      {spec.shape === 'line' && (
        <Group title="Line ends">
          <Segmented label="End caps" value={spec.cap} onChange={v => set({ cap: v })} options={LINE_CAPS.map(c => ({ id: c, label: c }))} />
          <Segmented label="Arrowheads" value={spec.arrows} onChange={v => set({ arrows: v })} options={ARROWS.map(a => ({ id: a, label: a }))} />
        </Group>
      )}
      {(spec.shape === 'polygon' || spec.shape === 'star') && (
        <Group title={spec.shape === 'star' ? 'Star' : 'Polygon'}>
          <Num label="Sides" value={spec.sides} min={3} max={12} onChange={v => set({ sides: v })} />
          {spec.shape === 'star' && <Num label="Inner radius" value={spec.inner} min={0.1} max={0.9} step={0.05} onChange={v => set({ inner: v })} />}
        </Group>
      )}
      <Group title="Fill">
        <Segmented
          label="Fill"
          value={f.type}
          onChange={v => set({ fill: v === 'none' ? { type: 'none' } : v === 'solid' ? { type: 'solid', color: '#facc15' } : { type: 'gradient', kind: 'linear', angle: 180, stops: [{ color: '#fde68a', at: 0 }, { color: '#f59e0b', at: 100 }] } })}
          options={[{ id: 'none', label: 'None' }, { id: 'solid', label: 'Solid' }, { id: 'gradient', label: 'Gradient' }]}
        />
        {f.type === 'solid' && <Colour label="Colour" value={f.color} onChange={v => set({ fill: { type: 'solid', color: v } })} />}
        {f.type === 'gradient' && (
          <>
            <Segmented label="Gradient type" value={f.kind} onChange={v => set({ fill: { ...f, kind: v } })} options={[{ id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }]} />
            <GradientStops stops={f.stops} onChange={stops => set({ fill: { ...f, stops } })} />
            {f.kind === 'linear' && <Num label="Angle" value={f.angle} min={0} max={360} step={5} onChange={v => set({ fill: { ...f, angle: v } })} />}
          </>
        )}
      </Group>
      <Group title="Stroke">
        <Colour label="Colour" value={spec.stroke.color} onChange={v => setStroke({ color: v })} />
        <Num label="Width" value={spec.stroke.width} min={0} max={40} step={0.5} onChange={v => setStroke({ width: v })} />
        <Num label="Dash" value={spec.stroke.dash} min={0} max={40} onChange={v => setStroke({ dash: v })} />
        {spec.shape !== 'line' && <Segmented label="Position" value={spec.stroke.pos} onChange={v => setStroke({ pos: v as ShapeSpec['stroke']['pos'] })} options={STROKE_POS.map(p => ({ id: p, label: p }))} />}
      </Group>
      <Group title="Effects">
        <EffectFields value={{ fx } as TextStyle} text={false} onChange={p => set({ fx: p.fx })} />
      </Group>
    </>
  );
}
