import { AIRequest, StandardAIResponse } from "./types";

export interface AIProvider {
  name: string;
  generateContent(request: AIRequest): Promise<StandardAIResponse>;
}
