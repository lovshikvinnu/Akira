import {
  TelemetryPipeline,
  TelemetryPipelineStage,
  TelemetrySink,
  TelemetryRecord,
} from "../contracts/telemetry";
import { PipelineError } from "../models/errors";

export class TelemetryPipelineImpl implements TelemetryPipeline {
  private readonly stages: TelemetryPipelineStage[] = [];
  private sink: TelemetrySink | null = null;

  public use(stage: TelemetryPipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  public setSink(sink: TelemetrySink): this {
    this.sink = sink;
    return this;
  }

  public async execute(record: TelemetryRecord): Promise<void> {
    let index = 0;

    const next = async (rec: TelemetryRecord): Promise<void> => {
      if (index < this.stages.length) {
        const stage = this.stages[index++];
        try {
          await stage.process(rec, next);
        } catch (err: any) {
          throw new PipelineError(`Error in pipeline stage '${stage.name}': ${err.message}`, err);
        }
      } else if (this.sink) {
        try {
          await this.sink.write(rec);
        } catch (err: any) {
          throw new PipelineError(
            `Error in pipeline terminal sink '${this.sink.name}': ${err.message}`,
            err,
          );
        }
      }
    };

    try {
      await next(record);
    } catch (err: any) {
      if (err instanceof PipelineError) {
        throw err;
      }
      throw new PipelineError(`Pipeline execution failed: ${err.message}`, err);
    }
  }
}
