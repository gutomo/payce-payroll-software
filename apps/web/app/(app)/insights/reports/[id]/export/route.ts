import type { NextRequest } from "next/server";
import { apiBaseUrl } from "@/lib/env";
import { getAccessToken } from "@/lib/auth/session";

/**
 * Download proxy for report exports. The browser can't call the API directly (the access token is an
 * httpOnly cookie), so this route handler attaches the token server-side and streams the API's
 * file response straight back, preserving its content-type and attachment filename. The API enforces
 * the caller's permission and tenant scope; we only relay.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const upstream = await fetch(
    `${apiBaseUrl()}/insights/reports/${encodeURIComponent(id)}/export?format=${format}`,
    { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("Export failed", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition":
        upstream.headers.get("content-disposition") ?? `attachment; filename="report.${format}"`,
      "cache-control": "no-store",
    },
  });
}
