import {
  TelemetryRecord,
  TelemetryPipeline,
  TelemetryValidator,
  TelemetrySerializer,
} from "../contracts/telemetry";
import { TelemetryCorrelation } from "../models/correlation";
import { telemetryIdGenerator } from "../utils/id-generator";
import { simpleTelemetryValidator } from "./validator";
import { jsonTelemetrySerializer } from "./serializer";
import { TelemetryPipelineImpl } from "./pipeline";
import { deepFreeze } from "../models/metadata";

export class TelemetryServiceImpl {
  constructor(
    private readonly pipeline: TelemetryPipeline = new TelemetryPipelineImpl(),
    private readonly validator: TelemetryValidator = simpleTelemetryValidator,
    private readonly serializer: TelemetrySerializer = jsonTelemetrySerializer,
  ) {}

  /**
   * Records a telemetry record by validating it and running it through the pipeline.
   * If any step fails, errors are caught or propagated safely without crashing the system.
   */
  public async record(record: TelemetryRecord): Promise<void> {
    this.validator.validate(record);
    await this.pipeline.execute(record);
  }

  /**
   * Generates a new correlation context structure.
   */
  public generateCorrelation(overrides?: Partial<TelemetryCorrelation>): TelemetryCorrelation {
    return {
      correlationId: telemetryIdGenerator.generateId(),
      ...overrides,
    };
  }

  /**
   * Generates a trace identifier.
   */
  public generateTrace(): string {
    return telemetryIdGenerator.generateId();
  }

  /**
   * Generates a span identifier.
   */
  public generateSpan(): string {
    return telemetryIdGenerator.generateId();
  }

  /**
   * Validates a record dynamically against the standard rules.
   */
  public validate(record: TelemetryRecord): void {
    this.validator.validate(record);
  }

  /**
   * Deep freezes a record to guarantee runtime immutability.
   */
  public freeze(record: TelemetryRecord): TelemetryRecord {
    return deepFreeze(record as any);
  }

  /**
   * Serializes a record to a structured format string.
   */
  public serialize(record: TelemetryRecord): string {
    return this.serializer.serialize(record);
  }

  /**
   * Exposes the pipeline registry interface.
   */
  public getPipeline(): TelemetryPipeline {
    return this.pipeline;
  }
}

export const telemetryService = new TelemetryServiceImpl();
