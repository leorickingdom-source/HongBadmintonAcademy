export interface SendInput {
  to: string; // E.164, e.g. +60123456789
  templateName?: string; // approved template (business-initiated messages)
  languageCode?: string; // default "en"
  bodyParams?: string[]; // ordered {{1}},{{2}} ... template variables
  text?: string; // fallback / session messages
}

export interface SendResult {
  status: "sent" | "failed";
  providerMessageId?: string;
  error?: string;
}

export interface WhatsappProvider {
  readonly id: "meta_cloud" | "twilio";
  send(input: SendInput): Promise<SendResult>;
}
