const SESSION_SECONDS = 30 * 24 * 60 * 60;
const FAILED_LIMIT = 8;
const FAILED_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

const LOGIN_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f7fb"><title>Вход — Medoyv.App</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:24px;background:#f6f7fb;color:#192139;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.panel{width:min(100%,420px);padding:36px 30px 30px;background:#fff;border:1px solid #e5e9f2;border-radius:24px;box-shadow:0 24px 64px #1b315012}.brand{display:flex;align-items:center;gap:12px;font-size:19px;font-weight:750;letter-spacing:-.04em}.mark{width:36px;height:36px;border-radius:12px;background:linear-gradient(145deg,#326bff,#7c59f6);display:grid;grid-template-columns:repeat(2,7px);grid-template-rows:repeat(2,7px);gap:4px;place-content:center}.mark i{background:#fff;border-radius:2px}h1{margin:30px 0 8px;font-size:28px;letter-spacing:-.05em}p{margin:0 0 24px;color:#69738a;line-height:1.5}label{display:block;margin-bottom:8px;font-size:13px;font-weight:650}input{width:100%;height:50px;border:1px solid #dce2ed;border-radius:12px;padding:0 14px;font:inherit;outline:none}input:focus{border-color:#5079f5;box-shadow:0 0 0 3px #5079f51a}button{width:100%;height:50px;margin-top:14px;border:0;border-radius:12px;background:#356af4;color:white;font:inherit;font-weight:700;cursor:pointer}button:active{transform:translateY(1px)}.error{margin-top:14px;color:#b42332;font-size:14px}.hint{margin-top:22px!important;margin-bottom:0!important;font-size:12px}
</style></head><body><main class="panel"><div class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Medoyv.App</div><h1>Закрытый каталог</h1><p>Введите код доступа, который вам передал владелец сайта.</p><form action="/login" method="post"><label for="password">Код доступа</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Войти</button>{{ERROR}}</form><p class="hint">Пароль вводится только для доступа к каталогу.</p></main></body></html>`;

function securityHeaders(headers = new Headers()) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return headers;
}

function response(body, status, extraHeaders = {}) {
  const headers = securityHeaders(new Headers(extraHeaders));
  return new Response(body, { status, headers });
}

function html(body, status = 200) {
  return response(body, status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function redirect(location, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Location", location);
  headers.set("Cache-Control", "no-store");
  return response(null, 303, headers);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function isAuthenticated(request, secret) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const item = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("medoyv_session="));
  if (!item) return false;

  const token = item.slice("medoyv_session=".length);
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const providedSignature = base64UrlDecode(token.slice(separator + 1));
  const expiresAt = Number(payload);
  if (!providedSignature || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = base64UrlDecode(await sign(payload, secret));
  if (!expectedSignature || providedSignature.length !== expectedSignature.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) difference |= providedSignature[index] ^ expectedSignature[index];
  return difference === 0;
}

function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

async function readSmallForm(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 8192) return null;
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(body));
}

function rateLimited(request) {
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  let current = failedAttempts.get(key);
  if (!current || current.resetAt <= now) {
    current = { count: 0, resetAt: now + FAILED_WINDOW_MS };
    failedAttempts.set(key, current);
  }
  return current.count >= FAILED_LIMIT;
}

function registerFailure(request) {
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  let current = failedAttempts.get(key);
  if (!current || current.resetAt <= now) current = { count: 0, resetAt: now + FAILED_WINDOW_MS };
  current.count += 1;
  failedAttempts.set(key, current);
}

function loginPage(error = "", status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  return response(LOGIN_HTML.replace("{{ERROR}}", error), status, headers);
}

function addSecurityHeaders(assetResponse) {
  const headers = securityHeaders(new Headers(assetResponse.headers));
  headers.set("Cache-Control", "private, no-store");
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const secret = env.SITE_PASSWORD || "";
    if (secret.length < 12) {
      return response("SITE_PASSWORD is not configured. Set it as a Cloudflare secret before using the site.\n", 503, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/healthz") return response("ok", 200, { "Cache-Control": "no-store" });

    if (request.method === "GET" && pathname === "/login") return loginPage();

    if (request.method === "POST" && pathname === "/login") {
      if (rateLimited(request)) {
        return loginPage('<p class="error">Слишком много попыток. Подождите 15 минут.</p>', 429, { "Retry-After": "900" });
      }
      const form = await readSmallForm(request);
      if (!form) return response("Bad request", 400);
      if (!constantTimeEqual(form.get("password") || "", secret)) {
        registerFailure(request);
        const error = '<p class="error">Неверный код доступа. Попробуйте ещё раз.</p>';
        return loginPage(error, 401);
      }

      failedAttempts.delete(request.headers.get("CF-Connecting-IP") || "unknown");
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const signature = await sign(String(expiresAt), secret);
      return redirect("/", {
        "Set-Cookie": `medoyv_session=${expiresAt}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`
      });
    }

    if (request.method === "GET" && pathname === "/logout") {
      return redirect("/login", {
        "Set-Cookie": "medoyv_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return response("Method not allowed", 405, { Allow: "GET, HEAD" });
    }
    if (!await isAuthenticated(request, secret)) return redirect("/login");

    const assetResponse = await env.ASSETS.fetch(request);
    return addSecurityHeaders(assetResponse);
  }
};
