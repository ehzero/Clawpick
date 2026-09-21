import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePagesBasePath,
  rewritePagesAssetPaths,
} from "../scripts/prepare-pages.mjs";

test("normalizes the repository path without changing the site root", () => {
  assert.equal(normalizePagesBasePath("/Clawpick/"), "/Clawpick");
  assert.equal(normalizePagesBasePath("/"), "");
  assert.equal(normalizePagesBasePath(""), "");
  assert.throws(() => normalizePagesBasePath("Clawpick"), /Invalid GitHub Pages base path/);
  assert.throws(() => normalizePagesBasePath("/../private"), /Invalid GitHub Pages base path/);
});

test("keeps generated assets inside the GitHub Pages repository path", () => {
  const source = [
    '<script src="/assets/app.js"></script>',
    "<link href='/assets/app.css'>",
    "src: url(/assets/font.woff2)",
    '<meta property="og:image" content="https://example.com/assets/preview.png">',
  ].join("\n");

  assert.equal(
    rewritePagesAssetPaths(source, "/Clawpick/"),
    [
      '<script src="/Clawpick/assets/app.js"></script>',
      "<link href='/Clawpick/assets/app.css'>",
      "src: url(/Clawpick/assets/font.woff2)",
      '<meta property="og:image" content="https://example.com/assets/preview.png">',
    ].join("\n"),
  );
});

test("leaves static output unchanged for a root-domain deployment", () => {
  const source = '<script src="/assets/app.js"></script>';
  assert.equal(rewritePagesAssetPaths(source, "/"), source);
});
