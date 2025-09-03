// api/comments.ts
import { createClient } from "@libsql/client";
import { nanoid } from "nanoid";

// ---- CORS 白名单：只放你博客域名（也可加预览/本地域名）----
const ALLOW_ORIGINS = [
  "https://sh2048.github.io/blog2.0",     // 替换成你的 GitHub Pages 域名
  "https://your-custom-domain.com"
];

function corsHeaders(origin?: string) {
  const allow = origin && ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

export default async function handler(req: any, res: any) {
  // 预检
  if (req.method === "OPTIONS") {
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const h = corsHeaders(req.headers.origin);
    Object.entries(h).forEach(([k,v])=>res.setHeader(k, v as string));
    return res.status(204).end();
  }

  const h = corsHeaders(req.headers.origin);
  Object.entries(h).forEach(([k,v])=>res.setHeader(k, v as string));
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!
  });

  try {
    if (req.method === "GET") {
      const slug = String(req.query.slug || "").trim();
      if (!slug) return res.status(400).json({ error: "missing slug" });

      const { rows } = await db.execute({
        sql: "SELECT id, name, text, ts FROM comments WHERE slug = ? ORDER BY ts DESC LIMIT 200",
        args: [slug]
      });
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const { slug, name, text } = req.body || {};
      const s = String(slug || "").trim();
      const n = String(name || "").trim();
      const t = String(text || "").trim();

      if (!s || !n || !t) return res.status(400).json({ error: "missing fields" });
      if (n.length > 50 || t.length > 500) return res.status(400).json({ error: "too long" });

      const id = nanoid();
      const ts = Date.now();
      const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().slice(0, 64);
      const ua = (req.headers["user-agent"] || "").toString().slice(0, 256);

      await db.execute({
        sql: "INSERT INTO comments (id, slug, name, text, ts, ip, ua) VALUES (?,?,?,?,?,?,?)",
        args: [id, s, n, t, ts, ip, ua]
      });

      return res.status(201).json({ ok: true, id, ts });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "internal error" });
  }
}
