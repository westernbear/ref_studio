import type { FastifyRequest } from "fastify";
import {
  authenticateAdminBearer,
  authenticateSession,
  type AuthFailure,
  type AuthStore,
  type Principal,
} from "./auth.js";

export const adminRole = (principal: Principal): string =>
  principal.roles[0]?.toUpperCase().replace("-", "_") ?? "";

export const isAdminPrincipal = (principal: Principal): boolean =>
  ["SUPER_ADMIN", "OPS_ADMIN", "VIEWER"].includes(adminRole(principal));

export const requestHeader = (
  request: FastifyRequest,
  name: string,
): string | undefined => {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};

export const decodeCookieValue = (value: string | undefined): string => {
  try {
    return decodeURIComponent(value ?? "");
  } catch (error) {
    if (error instanceof URIError) return "";
    throw error;
  }
};

export const authenticateAdminRequest = (
  auth: AuthStore,
  request: FastifyRequest,
  expectedOrigin: string,
  now: number,
): Principal | AuthFailure => {
  const authorization = requestHeader(request, "authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const sessionId = requestHeader(request, "cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rvs_session="))
    ?.slice("rvs_session=".length);
  return token
    ? authenticateAdminBearer(auth, token, now)
    : authenticateSession(
        auth,
        decodeCookieValue(sessionId),
        requestHeader(request, "x-csrf-token"),
        requestHeader(request, "origin"),
        expectedOrigin,
        now,
      );
};
