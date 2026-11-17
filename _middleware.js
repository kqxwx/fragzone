const COOKIE = "fz_session";

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function getCookie(request) {
  const part = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return part ? part.slice(COOKIE.length + 1) : "";
}

function lockPage(reason) {
  const safeReason = String(reason || "Нарушение правил FRAGZONE").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
  const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090914"><title>Доступ ограничен — FRAGZONE</title>' +
  '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(ellipse at 50% 0,#5a164b55,transparent 55%),#080912;color:#f6f2ff;font-family:Inter,system-ui,sans-serif}.panel{width:min(520px,100%);padding:34px;border:1px solid #ff547455;border-radius:24px;background:linear-gradient(145deg,#191322,#0e101b);box-shadow:0 25px 90px #0009;text-align:center}.symbol{width:76px;height:76px;margin:0 auto 18px;display:grid;place-items:center;border-radius:24px;background:#ff54741b;border:1px solid #ff547455;color:#ff8298;font-size:36px}.eyebrow{color:#ff8298;font-size:11px;font-weight:900;letter-spacing:2px}h1{margin:12px 0;font-size:clamp(27px,7vw,38px)}p{color:#b8b0c7;line-height:1.65;font-size:14px}.reason{margin-top:22px;padding:14px;border-radius:12px;background:#ffffff08;border:1px solid #ffffff12;text-align:left;font-size:13px}.foot{margin-top:22px;color:#777187;font-size:11px}</style></head><body><main class="panel"><div class="symbol">⊘</div><div class="eyebrow">FRAGZONE SECURITY</div><h1>Доступ к сайту ограничен</h1><p>Для этого аккаунта действует полный бан. Вход и использование функций FRAGZONE заблокированы до снятия наказания владельцем сайта.</p><div class="reason"><b>Причина блокировки</b><br>' + safeReason + '</div><div class="foot">Если вы считаете блокировку ошибочной, обратитесь к администрации FRAGZONE.</div></main></body></html>';
  return new Response(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") return next();

  const token = getCookie(request);
  if (!token || !env.DB) return next();

  const acceptsHtml = (request.headers.get("Accept") || "").includes("text/html")
    || request.headers.get("Sec-Fetch-Dest") === "document";
  if (!acceptsHtml) return next();

  try {
    const tokenHash = await sha256(token);
    const ban = await env.DB.prepare(
      "SELECT u.email,p.reason FROM sessions s JOIN users u ON u.id=s.user_id JOIN punishments p ON p.user_id=u.id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND p.type='ban' AND p.active=1 AND (p.expires_at IS NULL OR p.expires_at>datetime('now')) ORDER BY p.created_at DESC LIMIT 1"
    ).bind(tokenHash).first();

    const ownerEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (ban && String(ban.email || "").toLowerCase() !== ownerEmail) return lockPage(ban.reason);
  } catch (error) {
    console.error("FRAGZONE_BAN_MIDDLEWARE", { message: String(error?.message || "D1 lookup failed") });
  }
  return next();
}