import { proxyV1 } from "../../auth-proxy";

type Context = {
  readonly params: Promise<{ readonly path: readonly string[] }>;
};

async function handle(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  return proxyV1(request, path);
}

export {
  handle as DELETE,
  handle as GET,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
