// Snapshots the fields the animation needs from ../../data/employees.json.
import { readFileSync, writeFileSync } from "node:fs";

const FEATURED_ID = "EMP004";
const src = JSON.parse(readFileSync(new URL("../../data/employees.json", import.meta.url), "utf8"));

const slim = (e) => ({
  id: e.id,
  name: e.name,
  title: e.title,
  role_level: e.role_level,
  business_unit: e.business_unit,
  location: e.location,
  business_chemistry: e.business_chemistry,
  allocations: e.allocations ?? [],
});

const out = src.map((e) => (e.id === FEATURED_ID ? { ...e } : slim(e)));
writeFileSync(
  new URL("../src/data/employees.sample.json", import.meta.url),
  JSON.stringify(out, null, 1),
);
console.log(`Wrote ${out.length} employees (featured: ${FEATURED_ID})`);
