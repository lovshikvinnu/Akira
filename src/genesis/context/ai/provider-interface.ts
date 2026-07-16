import { AIRequest, StandardAIResponse } from "./types";

export interface AIProvider {
  name: string;
  generateContent(request: AIRequest): Promise<StandardAIResponse>;
  generateContentStream?(
    request: AIRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<StandardAIResponse>;
}
