import { loadEnv } from "@ksp/shared";
import { getPrisma } from "@ksp/database";

export function db() {
  return getPrisma(loadEnv().DATABASE_URL);
}

export function env() {
  return loadEnv();
}
