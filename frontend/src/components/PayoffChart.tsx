import type { SweepPoint } from '../lib/payoff';

/**
 * Payoff chart — SVG line chart of strategy P/L vs underlying price at
 * expiry. Profit region shaded green, loss region shaded red, zero line
 * dashed, breakeven points marked with vertical dotted lines.
 *
 * Pure SVG, no chart library — this is ~150 LoC and renders crisp at
 * any zoom level. ViewBox is fixed at 800×280; CSS scales to container.
 *
 * Inputs:
 *   • points     — sweep result from sweepPayoff() (any number of samples)
 *   • breakevens — strike prices where the line crosses zero
 *   • currentSpot — optional vertical marker for the live underlying price
 */
export function PayoffChart({
  points,
  breakevens,
  currentSpot,
  height = 280,
}: {
  points: SweepPoint[];
  breakevens: number[];
  currentSpot?: number | null;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="card text-text-dim text-sm text-center py-12">
        Add at least one leg to see the payoff diagram.
      </div>
    );
  }

  const width = 800;
  const padX = 50;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xs = points.map((p) => p.underlying);
  const ys = points.map((p) => p.payoff);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 0);
  // Pad y so the line doesn't touch the edges
  const yPad = (yMax - yMin) * 0.08 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;
  const yRange = yHi - yLo || 1;
  const xRange = xMax - xMin || 1;

  const xScale = (x: number) => padX + ((x - xMin) / xRange) * innerW;
  const yScale = (y: number) => padY + innerH - ((y - yLo) / yRange) * innerH;
  const zeroY = yScale(0);

  // Build the line path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.underlying).toFixed(1)},${yScale(p.payoff).toFixed(1)}`)
    .join(' ');

  // Profit and loss area paths — two polygons clipped at zero line.
  // For each segment we close back to zeroY; SVG fills the area between
  // the line and zero, color-coded by sign.
  const profitArea = buildSplitArea(points, xScale, yScale, zeroY, 'positive');
  const lossArea = buildSplitArea(points, xScale, yScale, zeroY, 'negative');

  // Y-axis ticks: 5 ticks, prettyish round numbers
  const yTicks = niceTicks(yLo, yHi, 5);
  const xTicks = niceTicks(xMin, xMax, 7);

  return (
    <div className="card">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        role="img"
        aria-label="Strategy payoff at expiration"
      >
        {/* Profit / loss areas */}
        <path d={profitArea} className="fill-brand-green/15" />
        <path d={lossArea} className="fill-brand-red/15" />

        {/* Y gridlines */}
        {yTicks.map((y) => (
          <g key={`yt-${y}`}>
            <line
              x1={padX}
              y1={yScale(y)}
              x2={width - padX}
              y2={yScale(y)}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray={y === 0 ? '4,3' : '1,4'}
              className={y === 0 ? 'text-text-secondary' : 'text-border-subtle'}
            />
            <text
              x={padX - 6}
              y={yScale(y) + 3}
              className="fill-text-dim text-[10px]"
              textAnchor="end"
            >
              {fmtAxis(y)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xTicks.map((x) => (
          <g key={`xt-${x}`}>
            <line
              x1={xScale(x)}
              y1={padY + innerH}
              x2={xScale(x)}
              y2={padY + innerH + 4}
              stroke="currentColor"
              className="text-border-subtle"
              strokeWidth="1"
            />
            <text
              x={xScale(x)}
              y={padY + innerH + 14}
              className="fill-text-dim text-[10px]"
              textAnchor="middle"
            >
              {x.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Breakeven markers */}
        {breakevens.map((be, i) => (
          <g key={`be-${i}`}>
            <line
              x1={xScale(be)}
              y1={padY}
              x2={xScale(be)}
              y2={padY + innerH}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3,3"
              className="text-brand-amber"
            />
            <text
              x={xScale(be)}
              y={padY - 6}
              className="fill-brand-amber text-[10px]"
              textAnchor="middle"
            >
              BE {be.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Current spot marker */}
        {currentSpot != null && currentSpot >= xMin && currentSpot <= xMax && (
          <g>
            <line
              x1={xScale(currentSpot)}
              y1={padY}
              x2={xScale(currentSpot)}
              y2={padY + innerH}
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-brand-blue"
            />
            <text
              x={xScale(currentSpot)}
              y={padY + 12}
              className="fill-brand-blue text-[10px] font-semibold"
              textAnchor="middle"
            >
              spot {currentSpot.toFixed(2)}
            </text>
          </g>
        )}

        {/* The payoff line itself, last so it sits on top */}
        <path d={pathD} fill="none" strokeWidth="2" className="stroke-text-primary" />
      </svg>
    </div>
  );
}

/**
 * Build an SVG path for the area between the payoff line and the zero
 * line, ONLY where payoff is positive (or negative, depending on `mode`).
 * Crossings at zero are handled by linear interpolation between adjacent
 * points so the boundary is exact.
 */
function buildSplitArea(
  points: SweepPoint[],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
  zeroY: number,
  mode: 'positive' | 'negative',
): string {
  const wantsPositive = mode === 'positive';
  const inRegion = (p: SweepPoint) => (wantsPositive ? p.payoff > 0 : p.payoff < 0);
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = i > 0 ? points[i - 1]! : null;
    const inside = inRegion(p);
    const prevInside = prev ? inRegion(prev) : false;

    if (inside && !prevInside && prev) {
      // Entering region — interpolate the boundary point
      const t = -prev.payoff / (p.payoff - prev.payoff);
      const xCross = prev.underlying + t * (p.underlying - prev.underlying);
      current = [{ x: xScale(xCross), y: zeroY }];
    }
    if (inside) {
      current.push({ x: xScale(p.underlying), y: yScale(p.payoff) });
    }
    if (!inside && prevInside && prev) {
      // Leaving region — interpolate the boundary
      const t = -prev.payoff / (p.payoff - prev.payoff);
      const xCross = prev.underlying + t * (p.underlying - prev.underlying);
      current.push({ x: xScale(xCross), y: zeroY });
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    // If the last segment reaches the right edge while still in-region,
    // close it back down to zero at the rightmost x.
    const last = current[current.length - 1]!;
    current.push({ x: last.x, y: zeroY });
    segments.push(current);
  }

  return segments
    .map((seg) => {
      if (seg.length < 2) return '';
      const head = `M ${seg[0]!.x.toFixed(1)},${seg[0]!.y.toFixed(1)}`;
      const tail = seg.slice(1).map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      return `${head} ${tail} Z`;
    })
    .filter(Boolean)
    .join(' ');
}

/** Generate evenly-spaced "nice" axis ticks within [min, max]. */
function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const range = max - min;
  const rawStep = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let v = first; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function fmtAxis(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}
