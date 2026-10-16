const ALLOWED_ORIGINS = [
  "https://carxplain.co.uk",
  "https://www.carxplain.co.uk",
  "http://localhost:8788"
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "carxplain-api",
        environment: env.ENVIRONMENT || "unknown",
        time: new Date().toISOString()
      }, 200, origin);
    }

    return json({ ok: false, error: "Not found" }, 404, origin);
  }
};