/* ==========================================================================
   Policy Fit Checker - client configuration.
   Loaded before app.js on every page that needs the agents.

   WORKER_URL: optional Cloudflare Worker proxy for the live-LLM chat
   integration (see worker/ and README.md). Leave "" to run the built-in
   live-pipeline chat, which still re-queries the published catalog fresh
   for every policy question.
   ========================================================================== */
window.PFC_CONFIG = window.PFC_CONFIG || {};

/* Set this to your local proxy or deployed Cloudflare Worker URL.
   Local dev:  http://localhost:8787  (run: node worker/serve.mjs)
   Production: https://pfc-agent-proxy.<your-subdomain>.workers.dev */
window.PFC_CONFIG.WORKER_URL = window.PFC_CONFIG.WORKER_URL || "http://localhost:8787";
