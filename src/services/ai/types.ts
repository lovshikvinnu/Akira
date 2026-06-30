import { ContextPackage } from "../context/types";

export type AIRequest = {
  prompt: string;
  systemInstruction?: string;
  contextPackage?: ContextPackage;
  temperature?: number;
  maxTokens?: number;
};

export type StandardAIResponse = {
  responseId: string;
  provider: string;
  model: string;
  content: string;
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "other" | "unknown";
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type AIResponse = StandardAIResponse;
