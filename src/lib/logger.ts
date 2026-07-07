export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  details?: unknown;
}

type LogListener = (entry: LogEntry) => void;
const listeners = new Set<LogListener>();
const logHistory: LogEntry[] = [];
const maxLogs = 500; // Cap to avoid memory leaks

export const logger = {
  subscribe(listener: LogListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  info(message: string, details?: unknown) {
    this.log("info", message, details);
  },

  warn(message: string, details?: unknown) {
    this.log("warn", message, details);
  },

  error(message: string, details?: unknown) {
    this.log("error", message, details);
  },

  log(level: LogLevel, message: string, details?: unknown) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      details,
    };

    logHistory.unshift(entry);
    if (logHistory.length > maxLogs) {
      logHistory.pop();
    }

    listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.error("Error executing logger subscriber callback:", err);
      }
    });

    // Developer Mode logs to console. Normal users do not see console logs.
    if (typeof window !== "undefined") {
      const isDevMode = localStorage.getItem("akira:dev_mode") === "true";
      if (isDevMode) {
        const color =
          level === "error"
            ? "color: #f87171; font-weight: bold;"
            : level === "warn"
              ? "color: #fbbf24; font-weight: bold;"
              : "color: #38bdf8;";
        console.log(
          `%c[AKIRA:${level.toUpperCase()}] %c${message}`,
          color,
          "color: inherit;",
          details || "",
        );
      }
    }
  },

  getLogs(): LogEntry[] {
    return logHistory;
  },

  clear() {
    logHistory.length = 0;
  },
};
