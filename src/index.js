// ─────────────────────────────────────────────────────────────
// Scout MSS Weekly Report — Cloudflare Worker (per-record storage)
//
// Serves the dashboard (./public) AND a small shared-storage API.
// Storage model (in KV), so concurrent editors don't overwrite each other:
//   meta:sharedWeek                → which week id everyone shares
//   w:<week>:f:<field>             → one record per board field (overview, risks, …)
//   w:<week>:svc:<id>              → one record per workstream ("track")
// Because each track is its own record, two leads editing different
// workstreams write to different records and never clobber each other.
//
// Wire up in Cloudflare (see README):  KV bound as MSS_KV,  var TEAM_PASSCODE.
// ─────────────────────────────────────────────────────────────

const MAX_BYTES = 2_000_000;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "x-mss-pass,Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
function J(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}
function T(status, text) {
  return new Response(text, { status, headers: cors() });
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  // Presence check — no passcode. Lets the page tell "hosted with API" from "static only".
  if (path === "/api/ping") return T(200, "ok");

  // Everything else under /api requires the passcode.
  if (path.startsWith("/api/")) {
    if (!env.MSS_KV) return T(500, "KV not bound (add MSS_KV)");
    const want = (env.TEAM_PASSCODE || "").trim();
    const got = (request.headers.get("x-mss-pass") || "").trim();
    if (!want || got !== want) return T(401, "unauthorized");

    // Which week everyone shares.
    if (path === "/api/meta") {
      if (request.method === "GET") {
        const w = await env.MSS_KV.get("meta:sharedWeek");
        return J(200, { sharedWeek: w || null });
      }
      if (request.method === "PUT") {
        const body = await request.text();
        let o; try { o = JSON.parse(body); } catch (e) { return T(400, "bad json"); }
        if (o && o.sharedWeek) await env.MSS_KV.put("meta:sharedWeek", String(o.sharedWeek));
        return J(200, { ok: true });
      }
      return T(405, "method");
    }

    // Per-week records.
    if (path === "/api/records") {
      const week = url.searchParams.get("week") || (await safeWeekFromBody(request));
      if (request.method === "GET") {
        if (!week) return T(400, "missing week");
        const prefix = "w:" + week + ":";
        const listed = await env.MSS_KV.list({ prefix });
        const out = {};
        await Promise.all((listed.keys || []).map(async (k) => {
          const v = await env.MSS_KV.get(k.name);
          if (v !== null) out[k.name.slice(prefix.length)] = v;
        }));
        return J(200, { week, records: out });
      }
      if (request.method === "PUT") {
        const body = await request.text();
        if (body.length > MAX_BYTES) return T(413, "too large");
        let o; try { o = JSON.parse(body); } catch (e) { return T(400, "bad json"); }
        const w = o.week || week;
        if (!w) return T(400, "missing week");
        const prefix = "w:" + w + ":";
        const recs = o.records || {};
        const dels = o.deletes || [];
        await Promise.all([
          ...Object.keys(recs).map((k) => {
            let val = recs[k];
            if (typeof val !== "string") val = JSON.stringify(val);
            return env.MSS_KV.put(prefix + k, val);
          }),
          ...dels.map((k) => env.MSS_KV.delete(prefix + k)),
        ]);
        return J(200, { ok: true, wrote: Object.keys(recs).length, deleted: dels.length });
      }
      return T(405, "method");
    }

    return T(404, "no such api");
  }

  // Not an API path → serve the static dashboard.
  return env.ASSETS.fetch(request);
}

async function safeWeekFromBody(request) {
  try {
    if (request.method === "GET") return null;
    const clone = request.clone();
    const o = JSON.parse(await clone.text());
    return o && o.week ? o.week : null;
  } catch (e) { return null; }
}

export default { fetch: (req, env, ctx) => handle(req, env) };
