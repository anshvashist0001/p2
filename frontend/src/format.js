export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
export const date = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function colorFor(p) {
  return ["mint", "blue", "peach", "purple"][p.id % 4];
}
