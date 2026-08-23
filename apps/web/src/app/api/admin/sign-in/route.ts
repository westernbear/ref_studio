import { proxySignIn } from "../../auth-proxy";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return proxySignIn(request, "/admin/sign-in");
}
