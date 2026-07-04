const { performance } = require("perf_hooks");

const days = 183;
const salesPerDay = 180;
const queryLoops = 300;
const products = [
  "Pan",
  "Facturas",
  "Bizcochos",
  "Empanadas",
  "Sandwiches",
  "Masas",
  "Pizzas",
  "Bebidas",
  "Juanjo Dulce",
  "Juanjo Salado"
];
const today = new Date("2026-07-04T12:00:00");

function isoDay(offset) {
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function amount(n) {
  return Math.round(n);
}

const t0 = performance.now();
const sales = [];
const expenses = [];
const production = [];
const closures = [];

for (let d = 0; d < days; d += 1) {
  const date = isoDay(d);
  for (let i = 0; i < salesPerDay; i += 1) {
    const transfer = i % 5 === 0;
    const ticket = i % 3 === 0;
    sales.push({
      id: `s-${d}-${i}`,
      date,
      shiftType: i < salesPerDay / 2 ? "AM" : "PM",
      paymentMethod: transfer ? "Transferencia" : "Efectivo",
      transferStatus: transfer ? (i % 10 === 0 ? "pending" : "received") : "",
      type: ticket ? "ticket" : "sale",
      total: amount(500 + ((i * 137 + d * 53) % 48000)),
      deleted: i % 97 === 0,
      items: ticket
        ? products.slice(0, 1 + (i % 5)).map((p, idx) => ({
            name: p,
            quantity: idx + 1,
            price: 1000 + idx * 250
          }))
        : []
    });
  }
  for (let e = 0; e < 8; e += 1) {
    expenses.push({
      id: `e-${d}-${e}`,
      date,
      category: e % 2 ? "Proveedor" : "Gasto",
      amount: amount(1200 + ((e * 1700 + d * 311) % 80000)),
      method: e % 3 ? "Efectivo" : "Transferencia"
    });
  }
  for (let p = 0; p < products.length; p += 1) {
    production.push({
      id: `p-${d}-${p}`,
      date,
      category: p > 7 ? "Juanjo" : "General",
      productName: products[p],
      amount: amount(1 + ((p + d) % 40)),
      paid: p > 7 && d % 2 === 0
    });
  }
  closures.push({
    id: `c-${d}-am`,
    date,
    shiftType: "AM",
    kind: d % 4 === 0 ? "partial" : "complete",
    cashTotal: amount(50000 + d * 100),
    transferTotal: amount(20000 + d * 50)
  });
  closures.push({
    id: `c-${d}-pm`,
    date,
    shiftType: "PM",
    kind: d % 5 === 0 ? "partial" : "complete",
    cashTotal: amount(60000 + d * 110),
    transferTotal: amount(30000 + d * 60)
  });
}

const t1 = performance.now();

function summarizeMonth(prefix) {
  const monthSales = sales.filter((s) => s.date.startsWith(prefix) && !s.deleted);
  const monthExpenses = expenses.filter((e) => e.date.startsWith(prefix));
  const cash = monthSales
    .filter((s) => s.paymentMethod === "Efectivo")
    .reduce((a, s) => a + s.total, 0);
  const transfers = monthSales
    .filter((s) => s.paymentMethod === "Transferencia" && s.transferStatus === "received")
    .reduce((a, s) => a + s.total, 0);
  const pending = monthSales.filter((s) => s.paymentMethod === "Transferencia" && s.transferStatus !== "received").length;
  const spent = monthExpenses.reduce((a, e) => a + e.amount, 0);
  return {
    cash,
    transfers,
    pending,
    spent,
    balance: cash + transfers - spent,
    rows: monthSales.length + monthExpenses.length
  };
}

function movementsQuery() {
  return sales
    .filter(
      (s) =>
        s.date >= "2026-06-01" &&
        s.total > 999 &&
        s.total < 99999 &&
        !s.deleted &&
        (s.paymentMethod === "Efectivo" || s.paymentMethod === "Transferencia")
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.total - a.total)
    .slice(0, 250);
}

function productionGroup(day) {
  const rows = production.filter((p) => p.date === day);
  return rows.reduce((acc, p) => {
    const key = p.category === "Juanjo" ? "Juanjo" : p.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
}

let checksum = 0;
const t2 = performance.now();
for (let i = 0; i < queryLoops; i += 1) {
  checksum += summarizeMonth(i % 2 ? "2026-06" : "2026-07").balance;
  checksum += movementsQuery().length;
  checksum += Object.keys(productionGroup(isoDay(i % days))).length;
}
const t3 = performance.now();

console.log(
  JSON.stringify(
    {
      note: "Synthetic low-end workload. This is not a real Windows 7 VM or CPU throttle.",
      generated: {
        sales: sales.length,
        expenses: expenses.length,
        production: production.length,
        closures: closures.length
      },
      generateMs: Math.round(t1 - t0),
      queryLoops,
      queryMs: Math.round(t3 - t2),
      avgQueryMs: Number(((t3 - t2) / queryLoops).toFixed(2)),
      checksum
    },
    null,
    2
  )
);
