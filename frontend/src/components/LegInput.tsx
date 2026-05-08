import type { Leg, OptionType } from '../lib/payoff';

/**
 * One row in the strategy builder — represents a single leg.
 * Bidirectional: edits flow back to the parent via `onChange`, removal
 * via `onRemove`. Pure controlled component, no internal state.
 */
export function LegInput({
  leg,
  onChange,
  onRemove,
}: {
  leg: Leg;
  onChange: (next: Leg) => void;
  onRemove: () => void;
}) {
  const isLong = leg.qty > 0;

  return (
    <div className="grid grid-cols-12 gap-2 items-center text-sm">
      {/* Side: long/short toggle */}
      <div className="col-span-2 flex">
        <button
          type="button"
          onClick={() => onChange({ ...leg, qty: Math.abs(leg.qty) || 1 })}
          className={`flex-1 px-2 py-1.5 rounded-l-md text-xs uppercase tracking-hairline border ${
            isLong
              ? 'bg-brand-green/15 border-brand-green/40 text-brand-green'
              : 'bg-bg-subtle border-border-subtle text-text-dim hover:text-text-secondary'
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...leg, qty: -Math.abs(leg.qty) || -1 })}
          className={`flex-1 px-2 py-1.5 rounded-r-md text-xs uppercase tracking-hairline border-t border-r border-b ${
            !isLong
              ? 'bg-brand-red/15 border-brand-red/40 text-brand-red'
              : 'bg-bg-subtle border-border-subtle text-text-dim hover:text-text-secondary'
          }`}
        >
          Short
        </button>
      </div>

      {/* Type: call/put */}
      <div className="col-span-2 flex">
        <button
          type="button"
          onClick={() => onChange({ ...leg, optionType: 'CALL' })}
          className={`flex-1 px-2 py-1.5 rounded-l-md text-xs uppercase tracking-hairline border ${
            leg.optionType === 'CALL'
              ? 'bg-brand-blue/15 border-brand-blue/40 text-brand-blue'
              : 'bg-bg-subtle border-border-subtle text-text-dim hover:text-text-secondary'
          }`}
        >
          Call
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...leg, optionType: 'PUT' })}
          className={`flex-1 px-2 py-1.5 rounded-r-md text-xs uppercase tracking-hairline border-t border-r border-b ${
            leg.optionType === 'PUT'
              ? 'bg-brand-blue/15 border-brand-blue/40 text-brand-blue'
              : 'bg-bg-subtle border-border-subtle text-text-dim hover:text-text-secondary'
          }`}
        >
          Put
        </button>
      </div>

      {/* Quantity */}
      <label className="col-span-2 flex flex-col">
        <span className="text-2xs uppercase tracking-hairline text-text-muted mb-0.5">Qty</span>
        <input
          type="number"
          value={Math.abs(leg.qty)}
          onChange={(e) => {
            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
            onChange({ ...leg, qty: isLong ? n : -n });
          }}
          className="input font-mono tabular text-right"
          min={1}
          max={500}
        />
      </label>

      {/* Strike */}
      <label className="col-span-2 flex flex-col">
        <span className="text-2xs uppercase tracking-hairline text-text-muted mb-0.5">Strike</span>
        <input
          type="number"
          step="0.5"
          value={leg.strike}
          onChange={(e) => onChange({ ...leg, strike: Math.max(0, Number(e.target.value) || 0) })}
          className="input font-mono tabular text-right"
        />
      </label>

      {/* Entry price */}
      <label className="col-span-3 flex flex-col">
        <span className="text-2xs uppercase tracking-hairline text-text-muted mb-0.5">
          {isLong ? 'Debit / share' : 'Credit / share'}
        </span>
        <input
          type="number"
          step="0.01"
          value={leg.entryPrice}
          onChange={(e) =>
            onChange({ ...leg, entryPrice: Math.max(0, Number(e.target.value) || 0) })
          }
          className="input font-mono tabular text-right"
        />
      </label>

      {/* Remove */}
      <div className="col-span-1 flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="text-text-dim hover:text-brand-red px-2 py-1.5 text-sm"
          title="Remove this leg"
          aria-label="Remove leg"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Construct a fresh leg with sensible defaults — used by "+ Add leg". */
export function blankLeg(idx: number, atm: number, optionType: OptionType = 'PUT'): Leg {
  return {
    id: `leg-${Date.now()}-${idx}`,
    optionType,
    strike: Math.round(atm * 0.97),
    entryPrice: Number((atm * 0.018).toFixed(2)),
    qty: -1,
  };
}
