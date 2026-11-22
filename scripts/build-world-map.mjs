/**
 * Génère apps/web/public/geo/world.json : tracés SVG (déjà projetés) des pays du
 * monde, à partir de Natural Earth (paquet world-atlas, 1:50m ; Tuvalu, absent à
 * cette échelle, vient de la version 1:10m).
 *
 * Les dépendances ne sont pas dans le projet : installez-les dans un dossier à part
 * puis passez son node_modules en argument :
 *   npm install --prefix /tmp/geo world-atlas@2.0.2 topojson-client@3.1.0 d3-geo@3.1.1
 *   node scripts/build-world-map.mjs /tmp/geo/node_modules
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const modules = resolve(process.argv[2] ?? "node_modules");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(modules, "noop.js"));
const { feature } = require("topojson-client");
const { geoNaturalEarth1, geoPath } = await import(
  pathToFileURL(join(modules, "d3-geo", "src", "index.js")).href
);

const atlas = (scale) =>
  JSON.parse(readFileSync(join(modules, "world-atlas", `countries-${scale}.json`), "utf8"));
const fifty = feature(atlas("50m"), atlas("50m").objects.countries).features;
const ten = feature(atlas("10m"), atlas("10m").objects.countries).features;
const have = new Set(fifty.map((f) => f.id));
const features = [...fifty, ...ten.filter((f) => f.id === "798" && !have.has(f.id))];

// Liste des membres de l'ONU (même fichier que le site).
const members = new Map(
  readFileSync(join(root, "packages/content/src/geography/un-members.ts"), "utf8")
    .split("`")[1]
    .split("\n")
    .map((l) => [l.slice(0, 3), l.slice(4)]),
);

const W = 1000;
const H = 520;
// L'Antarctique n'est membre de rien et écrase la carte : on la retire.
const shown = features.filter((f) => f.properties.name !== "Antarctica");
const projection = geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [W - 4, H - 4],
  ],
  { type: "FeatureCollection", features: shown },
);
const path = geoPath(projection).digits(1);

const countries = [];
const others = [];
for (const f of shown) {
  const d = path(f);
  if (!d) continue;
  if (f.id && members.has(f.id)) {
    const [cx, cy] = path.centroid(f);
    // Surface à l'écran (px²) : les tout petits pays reçoivent un rond cliquable.
    const area = path.area(f);
    const entry = {
      id: f.id,
      d,
      cx: Math.round(cx * 10) / 10,
      cy: Math.round(cy * 10) / 10,
      small: area < 12,
      area,
    };
    // Même pays en plusieurs morceaux (ex. Australie et îles Ashmore) : un seul tracé,
    // centré sur le plus grand.
    const same = countries.find((c) => c.id === f.id);
    if (!same) countries.push(entry);
    else {
      const main = same.area >= area ? same : entry;
      Object.assign(same, { ...main, d: same.d + d, area: same.area + area });
      same.small = same.area < 12;
    }
  } else {
    others.push(d);
  }
}
const missing = [...members.keys()].filter((id) => !countries.some((c) => c.id === id));
if (missing.length > 0) throw new Error(`Pays absents de la carte : ${missing.join(", ")}`);

const out = join(root, "apps/web/public/geo/world.json");
mkdirSync(dirname(out), { recursive: true });
const slim = countries.map(({ area: _area, ...c }) => c);
writeFileSync(out, JSON.stringify({ width: W, height: H, countries: slim, others }));
console.log(`${countries.length} pays, ${others.length} autres territoires → ${out}`);
