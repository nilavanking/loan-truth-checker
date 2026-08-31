"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { loanInputSchema, type LoanInputFormValues } from "@/lib/schemas";

export function LoanInputForm({ values, onValuesChange }: { values: LoanInputFormValues; onValuesChange: (values: LoanInputFormValues) => void }) {
  const form = useForm<LoanInputFormValues>({ resolver: zodResolver(loanInputSchema), values, mode: "onChange" });

  useEffect(() => {
    const subscription = form.watch((next) => {
      if (next.principal !== undefined && next.rate !== undefined && next.months !== undefined) {
        onValuesChange(next as LoanInputFormValues);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, onValuesChange]);

  const fields: Array<{ name: keyof LoanInputFormValues; label: string; suffix: string }> = [
    { name: "principal", label: "Loan amount", suffix: "₹" },
    { name: "rate", label: "Annual interest rate", suffix: "% p.a." },
    { name: "months", label: "Tenure", suffix: "months" },
  ];

  return <Form {...form}><form className="form-grid three validated-loan-form" aria-label="Loan calculation inputs">
    {fields.map((field) => <FormField key={field.name} control={form.control} name={field.name} render={({ field: input }) => <FormItem className="field">
      <FormLabel>{field.label}</FormLabel>
      <div className="input-wrap"><FormControl><Input {...input} inputMode={field.name === "months" ? "numeric" : "decimal"} aria-describedby={`${field.name}-help`}/></FormControl><span>{field.suffix}</span></div>
      <FormMessage id={`${field.name}-help`}/>
    </FormItem>}/>) }
  </form></Form>;
}
