export function GET() {
  return Response.json({ status: "ok", checks: { web: "ok" } });
}
