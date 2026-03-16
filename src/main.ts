/**
 * Entry point: starts the HTTP server and the validation poll loop together.
 *
 * Run:
 *   npm start          (compiled JS via tsc)
 *   tsx src/main.ts    (direct TypeScript during development)
 */
import { startServer } from "./server/index.js";
import { startPollLoop } from "./router/index.js";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";

logger.info("ERC-8004 Verification Node starting...");
logger.info(`  Registry  : ${env.REGISTRY_ADDRESS}`);
logger.info(`  Router    : ${env.ROUTER_ADDRESS}`);
logger.info(`  Validator : ${env.VALIDATOR_ADDRESS}`);
logger.info(`  Base URL  : ${env.BASE_URL}`);

startServer(env.SERVER_PORT);
startPollLoop(env.ROUTER_ADDRESS);
