import "dotenv/config";

function require(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  RPC_URL:           require("RPC_URL"),
  PRIVATE_KEY:       require("PRIVATE_KEY"),
  REGISTRY_ADDRESS:  require("REGISTRY_ADDRESS"),
  ROUTER_ADDRESS:    require("ROUTER_ADDRESS"),
  VALIDATOR_ADDRESS: require("VALIDATOR_ADDRESS"),
  BASE_URL:          require("BASE_URL"),
  SERVER_PORT:       Number(process.env["SERVER_PORT"] ?? 3000),
};
