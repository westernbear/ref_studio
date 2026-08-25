import { proxyAdmin } from "../../auth-proxy";

type Context = {
  readonly params: Promise<{ readonly path: readonly string[] }>;
};

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { path } = await context.params;
  return proxyAdmin(request, path);
}

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  const { path } = await context.params;
  return proxyAdmin(request, path);
}
