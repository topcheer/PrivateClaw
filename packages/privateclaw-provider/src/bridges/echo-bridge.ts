import type { PrivateClawAttachment } from "@privateclaw/protocol";
import type { BridgeResponse, PrivateClawAgentBridge } from "../types.js";

export class EchoBridge implements PrivateClawAgentBridge {
  constructor(private readonly prefix = "PrivateClaw demo") {}

  async handleUserMessage(params: {
    message: string;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
  }): Promise<BridgeResponse> {
    if (!params.attachments || params.attachments.length === 0) {
      return `${this.prefix}: ${params.message}`;
    }

    return `${this.prefix}: ${params.message}${params.message.trim() === "" ? "" : "\n\n"}${[
      "Attachments:",
      ...params.attachments.map(
        (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
      ),
    ].join("\n")}`;
  }
}
