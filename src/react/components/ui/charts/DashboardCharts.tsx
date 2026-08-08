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
  PaymentSlice,
  TopItem,
  CustomerShare,
  TrendPoint,
} from "../../../utils/insights";
import { compactINR, formatINR } from "../../../utils/format";

// Brand accent (munsell_blue) for single-series marks. The payment mix is the
// only categorical chart, so it draws from the validated categorical trio
// (blue/orange/aqua) keyed by payment entity — never by rank.
const ACCENT = "#298E9E";
const PAYMENT_COLORS: Record<string, string> = {
  cash: "#2a78d6",
  card: "#eb6834",
  upi: "#1baf7a",
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
