import handler from "vinext/server/fetch-handler";
import { initializeEmptyPosDatabase } from "./pos-d1-first-boot";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    // Bootstrap only the VERIFIED empty POS D1, on the first public menu API request.
    // Never alter an existing POS schema and never run for orders or payments.
    if (request.method === "GET" && new URL(request.url).pathname === "/api/delivery") {
      if (!env.DB) return new Response("POS_DATABASE_BINDING_UNAVAILABLE", { status: 503 });
      try {
        await initializeEmptyPosDatabase(env.DB);
      } catch (error) {
        console.error("POS one-time D1 initialization error", error);
        const reason = error instanceof Error ? error.message : "unknown";
        // Temporary sanitized diagnosis: no SQL, credentials, or user data.
        const kind = reason.startsWith("POS_SCHEMA_") ? reason.slice(0, 100) :
          reason.match(/000[0-9]_|001[0-5]_/)?.[0] ?? 
          (reason.includes("too many") ? "D1_QUERY_LIMIT" :
          reason.includes("SQLITE") ? "D1_SQLITE" : "D1_INTERNAL");
        return new Response(JSON.stringify({ error: "POS_DATABASE_INITIALIZATION_FAILED", stage: kind }), {
          status: 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
