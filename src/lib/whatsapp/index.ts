import "server-only";
import { metaProvider } from "./meta";
import type { WhatsappProvider } from "./types";

export function getWhatsappProvider(): WhatsappProvider {
  return metaProvider;
}

export type { SendInput, SendResult, WhatsappProvider } from "./types";
