"use client";

import { useState } from "react";
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/money";

export type AmortizationRow = { month?: number; year?: number; opening: number; payment: number; interest: number; principal: number; balance: number };

export function AmortizationTable({ rows, yearly }: { rows: AmortizationRow[]; yearly: boolean }) {
  const [pageSize, setPageSize] = useState(12);
  const columns: ColumnDef<AmortizationRow>[] = [
    { id: "period", header: yearly ? "Year" : "Month", cell: ({ row }) => <strong>{yearly ? row.original.year : row.original.month}</strong> },
    { accessorKey: "payment", header: "Payment", cell: ({ getValue }) => formatInr(getValue<number>()) },
    { accessorKey: "interest", header: "Interest", cell: ({ getValue }) => <span className="interest">{formatInr(getValue<number>())}</span> },
    { accessorKey: "principal", header: "Principal", cell: ({ getValue }) => <span className="principal">{formatInr(getValue<number>())}</span> },
    { accessorKey: "balance", header: "Balance", cell: ({ getValue }) => formatInr(getValue<number>()) },
  ];
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageIndex: 0, pageSize } } });
  const updatePageSize = (size: number) => { setPageSize(size); table.setPageSize(size); };
  return <div className="data-table-shell">
    <div className="table-toolbar"><span>{rows.length} repayment periods</span><label>Rows <select value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value))}><option value="12">12</option><option value="24">24</option><option value="60">60</option></select></label></div>
    <Table className="professional-table"><TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table>
    <div className="table-pagination"><span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><div><Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button><Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button></div></div>
  </div>;
}
