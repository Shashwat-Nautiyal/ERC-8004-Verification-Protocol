import express, { type Request, type Response } from "express";
import { saveResponse, getResponse, getAllResponses, getResponsesByAgent } from "./store.js";
import type { ResponseBlob } from "./store.js";
import { logger } from "../utils/logger.js";

const app = express();
app.use(express.json());

// POST /responses — called internally by the router after scoring
app.post("/responses", (req: Request, res: Response) => {
  const body = req.body as ResponseBlob;
  if (!body.requestId || body.score === undefined || !body.agentId) {
    return res.status(400).json({ error: "requestId, score, and agentId are required" });
  }
  saveResponse(body.requestId, body);
  logger.info(`Stored response for ${body.requestId} agent=${body.agentId} score=${body.score}`);
  return res.status(201).json({ ok: true });
});

// GET /responses/:id — responseURI endpoint: full score breakdown by requestId
app.get("/responses/:id", (req: Request, res: Response) => {
  const blob = getResponse(req.params.id);
  if (!blob) return res.status(404).json({ error: "Not found" });
  return res.json(blob);
});

// GET /responses — list all responses
app.get("/responses", (_req: Request, res: Response) => {
  return res.json(getAllResponses());
});

// GET /reputation/:agentId — trust snapshot: average score + history for an agent
app.get("/reputation/:agentId", (req: Request, res: Response) => {
  const blobs = getResponsesByAgent(req.params.agentId);
  if (blobs.length === 0) {
    return res.status(404).json({ error: "No responses found for this agentId" });
  }
  const scores = blobs.map((b) => b.score);
  const average = Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length);
  const latest  = blobs.sort((a, b) => b.timestamp - a.timestamp)[0];
  return res.json({
    agentId:      req.params.agentId,
    average,
    latest:       latest.score,
    latestAt:     latest.timestamp,
    responseCount: blobs.length,
    history:      blobs.map((b) => ({
      requestId: b.requestId,
      score:     b.score,
      timestamp: b.timestamp,
    })),
  });
});

// ── Mock payload store (used by seed scripts in dev/test only) ────────────────
const mockPayloads = new Map<string, string>();

// POST /mock-payloads — seed script uploads a raw payload JSON string
app.post("/mock-payloads", (req: Request, res: Response) => {
  const { id, payload } = req.body as { id: string; payload: string };
  if (!id || !payload) return res.status(400).json({ error: "id and payload required" });
  mockPayloads.set(id, payload);
  return res.status(201).json({ ok: true });
});

// GET /mock-payload/:id — validator fetches the payload from this URI
app.get("/mock-payload/:id", (req: Request, res: Response) => {
  const raw = mockPayloads.get(req.params.id);
  if (!raw) return res.status(404).json({ error: "Mock payload not found" });
  res.setHeader("Content-Type", "application/json");
  return res.send(raw);
});
// ─────────────────────────────────────────────────────────────────────────────

export function startServer(port = 3000): void {
  app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });
}

export { app };
