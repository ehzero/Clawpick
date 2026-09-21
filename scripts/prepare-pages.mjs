import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIRECTORY = new URL("../dist/client/", import.meta.url);
const REWRITABLE_EXTENSIONS = Object.freeze(new Set([".html", ".rsc"]));

export function normalizePagesBasePath(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return "";
  if (!trimmed.startsWith("/") || trimmed.includes("..")) {
    throw new Error(`Invalid GitHub Pages base path: ${value}`);
  }
  return trimmed;
}

export function rewritePagesAssetPaths(source, basePath) {
  const normalized = normalizePagesBasePath(basePath);
  if (!normalized) return source;

  return source
    .replaceAll('"/assets/', `"${normalized}/assets/`)
    .replaceAll("'/assets/", `'${normalized}/assets/`)
    .replaceAll("url(/assets/", `url(${normalized}/assets/`);
}

async function listOutputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const url = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        url.pathname += "/";
        return listOutputFiles(url);
      }
      return [url];
    }),
  );
  return nested.flat();
}

export async function preparePagesOutput({ basePath, outputDirectory = OUTPUT_DIRECTORY }) {
  const normalized = normalizePagesBasePath(basePath);
  const files = await listOutputFiles(outputDirectory);

  for (const file of files) {
    if (!REWRITABLE_EXTENSIONS.has(extname(file.pathname))) continue;
    const source = await readFile(file, "utf8");
    const rewritten = rewritePagesAssetPaths(source, normalized);
    if (rewritten !== source) await writeFile(file, rewritten);
  }

  await writeFile(new URL(".nojekyll", outputDirectory), "");

  const index = await readFile(new URL("index.html", outputDirectory), "utf8");
  if (!/<meta name="robots" content="[^"]*noindex/i.test(index)) {
    throw new Error("GitHub Pages output is missing the robots noindex directive");
  }
  if (normalized && /(?:["'(])\/assets\//.test(index)) {
    throw new Error("GitHub Pages output still contains root-relative asset paths");
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  await preparePagesOutput({ basePath: process.env.PAGES_BASE_PATH ?? "" });
}
