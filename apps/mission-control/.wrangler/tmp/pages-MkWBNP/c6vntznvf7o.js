// <define:__ROUTES__>
var define_ROUTES_default = { version: 1, description: "Built with @cloudflare/next-on-pages@1.13.16.", include: ["/*"], exclude: ["/_next/static/*"] };

// ../../node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "D:\\youtube\\automated website\\content-factory\\apps\\mission-control\\.wrangler\\tmp\\pages-MkWBNP\\bundledWorker-0.08171188807800012.mjs";
import { isRoutingRuleMatch } from "D:\\youtube\\automated website\\content-factory\\node_modules\\wrangler\\templates\\pages-dev-util.ts";
export * from "D:\\youtube\\automated website\\content-factory\\apps\\mission-control\\.wrangler\\tmp\\pages-MkWBNP\\bundledWorker-0.08171188807800012.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=c6vntznvf7o.js.map
