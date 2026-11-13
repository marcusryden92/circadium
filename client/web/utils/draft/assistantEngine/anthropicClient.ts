"use client";

import Anthropic from "@anthropic-ai/sdk";

// BYOK: the user's own key, read from the device vault (lib/aiKey), calls
// api.anthropic.com straight from the browser. dangerouslyAllowBrowser is the
// SDK's opt-in for exactly this pattern; the header is Anthropic's CORS
// opt-in. baseURL is the future managed-mode seam — a server proxy that
// injects the app key without the loop changing.
export function createBrowserAnthropicClient(
  apiKey: string,
  baseURL?: string,
): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
}
