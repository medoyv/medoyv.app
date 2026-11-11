function secureHeaders(headers = new Headers()) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return headers;
}

function textResponse(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: secureHeaders(new Headers(extraHeaders))
  });
}

function servePublicAsset(assetResponse, pathname) {
  const headers = secureHeaders(new Headers(assetResponse.headers));
  headers.set("Cache-Control", pathname === "/service-worker.js" || /\.(html|js|css|webmanifest)$/.test(pathname)
    ? "no-cache"
    : "public, max-age=3600");

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse("Method not allowed", 405, { Allow: "GET, HEAD" });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return servePublicAsset(assetResponse, new URL(request.url).pathname);
  }
};
