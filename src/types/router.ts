import type { Mandate } from "./mandate.js";
import type { Receipt } from "./receipt.js";

export type RouterPayload = {
  agentId:  string;    // identity of the agent being validated
  mandate:  Mandate;
  receipt?: Receipt;
};

export type ValidationRequest = {
  requestId:   string;  // bytes32 hex
  router:      string;  // address
  requestURI:  string;  // where to fetch RouterPayload
  requestHash: string;  // keccak256 of the payload at requestURI — must be verified before processing
  deadline:    number;  // unix timestamp
};

export type ValidationResponse = {
  requestId: string;
  score: number;       // 0–100, aggregated
  validator: string;   // address of this node
  timestamp: number;   // unix timestamp
};
