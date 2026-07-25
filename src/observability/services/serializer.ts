import { TelemetrySerializer, TelemetryRecord } from "../contracts/telemetry";
import { TelemetrySerializationError } from "../models/errors";

export class JsonTelemetrySerializer implements TelemetrySerializer {
  public serialize(record: TelemetryRecord): string {
    try {
      return JSON.stringify(record);
    } catch (err: any) {
      throw new TelemetrySerializationError(
        `Failed to serialize telemetry record: ${err.message}`,
        err,
      );
    }
  }

  public deserialize(data: string): TelemetryRecord {
    try {
      return JSON.parse(data) as TelemetryRecord;
    } catch (err: any) {
      throw new TelemetrySerializationError(
        `Failed to deserialize telemetry record: ${err.message}`,
        err,
      );
    }
  }
}

export const jsonTelemetrySerializer = new JsonTelemetrySerializer();
