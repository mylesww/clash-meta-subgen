import { generateClashYaml } from "./lib/generate";
import { HttpError, isHttpError } from "./lib/errors";
import { assertHttpsUrl } from "./lib/parse";
import type { Env, SubConfig } from "./lib/types";

const DEFAULT_CACHE_TTL_SECONDS = 300;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method !== "GET") {
        return textResponse(405, "Method Not Allowed");
      }

      if (url.pathname === "/sub") {
        const token = url.searchParams.get("token");
        if (!env.ACCESS_TOKEN || token !== env.ACCESS_TOKEN) {
          return textResponse(401, "Unauthorized");
        }

        const config = url.searchParams.get("config");
        const extra = url.searchParams.get("extra");
        if (!config || !extra) {
          throw new HttpError(400, "Missing required query params: config, extra");
        }
        const extraSubs = parseExtraSubs(url.searchParams);

        const cacheTtl = parseCacheTtl(env.RESULT_CACHE_TTL_SECONDS);
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), request);

        if (cacheTtl > 0) {
          const cached = await cache.match(cacheKey);
          if (cached) {
            return cached;
          }
        }

        const yaml = await generateClashYaml({
          configUrl: config,
          extraUrl: extra,
          extraSubs,
        });

        const response = new Response(yaml, {
          status: 200,
          headers: {
            "content-type": "text/yaml; charset=utf-8",
            "cache-control": cacheTtl > 0 ? `public, max-age=${cacheTtl}` : "no-store",
          },
        });

        if (cacheTtl > 0) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }

        return response;
      }

      return textResponse(404, "Not Found");
    } catch (error) {
      if (isHttpError(error)) {
        return textResponse(error.status, error.message);
      }

      const message = error instanceof Error ? error.message : "Internal Server Error";
      return textResponse(500, message);
    }
  },
};

function parseExtraSubs(searchParams: URLSearchParams): SubConfig[] {
  return searchParams
    .getAll("subs")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value, index) => ({
      url: assertHttpsUrl(value, `subs[${index}].url`).toString(),
      tag: `extra${index + 1}`,
    }));
}

function parseCacheTtl(input: string | undefined): number {
  if (!input) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
