import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Clawpick physics lab shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Clawpick Physics Lab<\/title>/i);
  assert.match(
    html,
    /<meta name="robots" content="[^"]*noindex[^"]*nofollow[^"]*"\s*\/?>/i,
    "the public demo must tell search crawlers not to index or follow it",
  );
  assert.match(
    html,
    /<meta name="googlebot" content="[^"]*noindex[^"]*nofollow[^"]*"\s*\/?>/i,
    "Google must receive the same noindex policy as general crawlers",
  );
  assert.match(html, /CLAWPICK/);
  assert.match(html, /실물 기구 검증실/);
  assert.match(html, /DRAG TO ORBIT/);
  assert.match(html, /8-WAY · HOLD &amp; DRAG/);
  assert.match(html, /물리 튜닝/);
  assert.match(html, /간단 설정/);
  assert.match(html, /고급 설정/);
  assert.match(html, /부품 용어집/);
  assert.match(html, /파지력/);
  assert.match(html, /작동 속도/);
  assert.match(html, /안정성/);
  assert.match(html, />환경</);
  assert.doesNotMatch(html, /react-loading-skeleton/i);
});

test("removes the starter and keeps product metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ClawLab \/>/);
  assert.match(layout, /const title = "Clawpick Physics Lab"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("components/MachineScene.tsx", templateRoot));
});
