import { INR, dinero, toDecimal } from "dinero.js";

const safeMajor = (value: number) => Number.isFinite(value) ? value : 0;

export function inr(value: number) {
  return dinero({ amount: Math.round(safeMajor(value) * 100), currency: INR });
}

export function formatInr(value: number, fractionDigits = 0) {
  const decimal = Number(toDecimal(inr(value)));
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(decimal);
}

export function sumInr(values: number[]) {
  return values.reduce((paise, value) => paise + Math.round(safeMajor(value) * 100), 0) / 100;
}

export function differenceInr(left: number, right: number) {
  return (Math.round(safeMajor(left) * 100) - Math.round(safeMajor(right) * 100)) / 100;
}
