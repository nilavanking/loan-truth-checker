"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MatrixRow = { metric: string; [offerId: string]: string };

export function FinancierMatrixTable({ lenders, rows }: { lenders: Array<{ id: string; name: string }>; rows: Array<{ metric: string; values: Record<string, string> }> }) {
  const data: MatrixRow[] = rows.map((row) => ({ metric: row.metric, ...row.values }));
  const columns: ColumnDef<MatrixRow>[] = [
    { accessorKey: "metric", header: "Metric", cell: ({ getValue }) => <strong>{getValue<string>()}</strong> },
    ...lenders.map((lender): ColumnDef<MatrixRow> => ({ accessorKey: lender.id, header: lender.name, cell: ({ getValue }) => getValue<string>() })),
  ];
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return <div className="comparison-scroll"><Table className="financier-table professional-matrix"><TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table></div>;
}
