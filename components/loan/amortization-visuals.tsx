"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatInr } from "@/lib/money";

type Row = { month?: number; year?: number; interest: number; principal: number; balance: number };

const balanceConfig = { balance: { label: "Outstanding balance", color: "#0f766e" } } satisfies ChartConfig;
const splitConfig = {
  principal: { label: "Principal", color: "#0f766e" },
  interest: { label: "Interest", color: "#f59e0b" },
} satisfies ChartConfig;

export function AmortizationVisuals({ rows, principal, interest }: { rows: Row[]; principal: number; interest: number }) {
  const step = Math.max(1, Math.ceil(rows.length / 24));
  const balance = rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({ period: row.month ?? row.year ?? 0, balance: row.balance }));
  const split = [{ name: "principal", value: principal }, { name: "interest", value: interest }];
  return <section className="loan-visuals" aria-label="Loan repayment charts">
    <article><header><span>REPAYMENT PATH</span><h4>Outstanding balance</h4><p>How the unpaid principal falls over the selected tenure.</p></header>
      <ChartContainer config={balanceConfig} className="loan-chart"><AreaChart accessibilityLayer data={balance} margin={{ left: 4, right: 12, top: 8 }}><CartesianGrid vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false}/><YAxis hide/><ChartTooltip content={<ChartTooltipContent formatter={(value) => <strong>{formatInr(Number(value))}</strong>}/>}/><Area dataKey="balance" type="monotone" fill="var(--color-balance)" fillOpacity={0.18} stroke="var(--color-balance)" strokeWidth={2}/></AreaChart></ChartContainer>
    </article>
    <article><header><span>COST SPLIT</span><h4>Principal vs interest</h4><p>See how much of total repayment is borrowing and finance cost.</p></header>
      <ChartContainer config={splitConfig} className="loan-chart"><PieChart accessibilityLayer><ChartTooltip content={<ChartTooltipContent formatter={(value) => <strong>{formatInr(Number(value))}</strong>}/>}/><Pie data={split} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} strokeWidth={3}>{split.map((item) => <Cell key={item.name} fill={`var(--color-${item.name})`}/>)}</Pie></PieChart></ChartContainer>
      <div className="chart-legend"><span><i className="principal-dot"/>Principal <strong>{formatInr(principal)}</strong></span><span><i className="interest-dot"/>Interest <strong>{formatInr(interest)}</strong></span></div>
    </article>
  </section>;
}
