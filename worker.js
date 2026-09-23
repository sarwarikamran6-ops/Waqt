/**
 * Serve Waqt static assets. HTML never stays cached so clients always
 * pick up new hashed JS/CSS after a deploy.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("content-type") || "";
    const isHtml =
      type.includes("text/html") ||
      url.pathname === "/" ||
      url.pathname.endsWith(".html") ||
      (!url.pathname.includes(".") && request.method === "GET");

    if (!isHtml) return res;

    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
