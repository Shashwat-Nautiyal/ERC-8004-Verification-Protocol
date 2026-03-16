import type { ValidationResponse, VerifierResult } from "../types/index.js";

export type ResponseBlob = ValidationResponse & {
  agentId:         string;
  verifierResults: VerifierResult[];
};

const store = new Map<string, ResponseBlob>();

export function saveResponse(id: string, blob: ResponseBlob): void {
  store.set(id, blob);
}

export function getResponse(id: string): ResponseBlob | undefined {
  return store.get(id);
}

export function getAllResponses(): ResponseBlob[] {
  return Array.from(store.values());
}

export function getResponsesByAgent(agentId: string): ResponseBlob[] {
  return Array.from(store.values()).filter(
    (b) => b.agentId.toLowerCase() === agentId.toLowerCase()
  );
}
