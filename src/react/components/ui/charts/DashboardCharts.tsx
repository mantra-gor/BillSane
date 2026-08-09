import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CustomerMix,
  PaymentSlice,
  TopItem,
  CustomerShare,
  TrendPoint,
} from "../../../utils/insights";
import { compactINR, formatINR } from "../../../utils/format";

// Brand accent (munsell_blue) for single-series marks — a lone series carries
// no identity, so the brand hue is free to be slightly low-chroma there.
//
// Categorical charts draw from ONE fixed hue order, blue → orange → green,
// assigned per chart and never cycled or reassigned by rank. Validated against
// the white card surface: worst adjacent pair ΔE 33.6 normal / 24.7 protan /
// 32.7 tritan, all above the floor. (The brand aqua is deliberately not in the
// order: at chroma 0.09 it reads as grey next to a saturated neighbour.)
const ACCENT = "#298E9E";
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
const PAYMENT_COLORS: Record<string, string> = {
  cash: CATEGORICAL[0],
  card: CATEGORICAL[1],
  upi: CATEGORICAL[2],
};
const OTHER_COLOR = "#93A5B4";
const GRID = "#EEF3F8";
const AXIS_TICK = {
  fill: "#64798B",
  fontSize: 11,
  fontWeight: 500,
};
const HOVER_FILL = "#F1F5F9";

function paymentColor(type: string): string {
  return PAYMENT_COLORS[type.toLowerCase()] ?? OTHER_COLOR;
}

// --- Shared tooltip ---------------------------------------------------------

interface TooltipRow {
  name?: string;
  value?: number | string;
  payload?: Record<string, unknown>;
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const amount = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      {label != null && (
        <p className="mb-0.5 text-[11px] font-medium text-ink-muted">{label}</p>
      )}
      <p className="text-sm font-bold text-ink tnum">{formatINR(amount)}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-ink-faint">
      {message}
    </div>
  );
}

// --- Sales trend (single-series area) ---------------------------------------

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <EmptyChart message="No sales in this period" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => compactINR(v)}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ stroke: ACCENT, strokeOpacity: 0.3 }} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#trendFill)"
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// --- Payment mix (categorical donut + labelled legend) ----------------------

export function PaymentMixDonut({ data }: { data: PaymentSlice[] }) {
  if (!data.length) return <EmptyChart message="No payments yet" />;
  const total = data.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <div className="flex h-full flex-col items-center gap-3 sm:flex-row">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="type"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.type} fill={paymentColor(slice.type)} />
              ))}
            </Pie>
            <Tooltip content={<MoneyTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Labelled legend doubles as the relief rule: identity + value, never
          color-alone (aqua sits below 3:1 on the white surface). */}
      <ul className="w-full space-y-2">
        {data.map((slice) => {
          const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0;
          return (
            <li key={slice.type} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: paymentColor(slice.type) }}
              />
              <span className="font-medium capitalize text-ink-soft">
                {slice.type}
              </span>
              <span className="ml-auto font-semibold text-ink tnum">
                {formatINR(slice.amount)}
              </span>
              <span className="w-10 text-right text-xs text-ink-faint tnum">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- First-time vs returning (100% stacked bar + labelled legend) -----------

/**
 * Where the period's money came from: opening purchases or repeat ones.
 *
 * A part-to-whole with exactly two sides doesn't need a plot — one bar reads
 * the split instantly and leaves room for the actual numbers underneath, which
 * is what an owner acts on. The 2px surface gap between segments is the mark
 * spec for stacked fills; the legend carries identity so nothing is colour-only.
 */
export function CustomerMixSplit({ data }: { data: CustomerMix }) {
  const total = data.firstTime.revenue + data.returning.revenue;
  const invoices = data.firstTime.invoices + data.returning.invoices;
  if (invoices === 0) return <EmptyChart message="No sales in this period" />;

  const sides = [
    {
      key: "returning",
      label: "Returning",
      hint: "repeat purchases",
      color: CATEGORICAL[0],
      ...data.returning,
    },
    {
      key: "firstTime",
      label: "First-time",
      hint: "opening purchases",
      color: CATEGORICAL[1],
      ...data.firstTime,
    },
  ];

  // Share is taken on revenue when there is any, on invoice counts otherwise —
  // a period of fully-discounted zero-value bills should still draw a bar.
  const share = (side: (typeof sides)[number]) =>
    total > 0 ? side.revenue / total : side.invoices / invoices;

  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {sides
          .filter((side) => share(side) > 0)
          .map((side) => (
            <div
              key={side.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${share(side) * 100}%`,
                backgroundColor: side.color,
              }}
            />
          ))}
      </div>

      <ul className="space-y-2.5">
        {sides.map((side) => (
          <li key={side.key} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: side.color }}
            />
            <span className="min-w-0">
              <span className="font-medium text-ink-soft">{side.label}</span>
              <span className="ml-1.5 text-xs text-ink-faint tnum">
                {side.invoices} {side.hint}
              </span>
            </span>
            <span className="ml-auto font-semibold text-ink tnum">
              {formatINR(side.revenue)}
            </span>
            <span className="w-10 text-right text-xs text-ink-faint tnum">
              {Math.round(share(side) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Top items (single-series horizontal bars) ------------------------------

export function TopItemsBar({ data }: { data: TopItem[] }) {
  if (!data.length) return <EmptyChart message="No items sold yet" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          tickFormatter={(v: number) => compactINR(v)}
        />
        <YAxis
          type="category"
          dataKey="itemName"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: HOVER_FILL }} />
        <Bar dataKey="revenue" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- Customer concentration (single-series horizontal bars, share %) --------

export function CustomerBar({ data }: { data: CustomerShare[] }) {
  if (!data.length) return <EmptyChart message="No customers yet" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          tickFormatter={(v: number) => compactINR(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: HOVER_FILL }} />
        <Bar dataKey="revenue" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
