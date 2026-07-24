process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { initializeDatabase } from "../../persistence/initializer";
import { getDatabaseConnection } from "../../persistence/connection";
import { SqliteEventRepository } from "../event-store/sqlite-event-repository";
import { PersistenceSubscriber } from "../event-store/persistence-subscriber";
import { EventBus } from "../event-bus";
import { Publisher } from "../publisher";

// ----------------------------------------------------

async function runBenchmark(batchSize: number) {
  const db = getDatabaseConnection();
  const repo = new SqliteEventRepository(db);
  const bus = new EventBus();
  bus.subscribe(new PersistenceSubscriber(repo));
  const publisher = new Publisher(bus);

  const latencies: number[] = [];
  const memoryBefore = process.memoryUsage().heapUsed;
  const start = performance.now();

  for (let i = 0; i < batchSize; i++) {
    const pStart = performance.now();
    publisher.publish({
      type: "benchmark.event",
      source: "benchmark-test",
      payload: { index: i, largeField: "x".repeat(100) },
      version: 1,
    });
    latencies.push(performance.now() - pStart);
  }

  const end = performance.now();
  const totalTimeMs = end - start;
  const memoryAfter = process.memoryUsage().heapUsed;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const totalLatency = latencies.reduce((acc, val) => acc + val, 0);
  const avgLatency = totalLatency / batchSize;
  const p95Idx = Math.floor(batchSize * 0.95);
  const p95Latency = latencies[p95Idx];
  const maxLatency = latencies[latencies.length - 1];

  const throughput = (batchSize / totalTimeMs) * 1000;
  const memoryGrowth = (memoryAfter - memoryBefore) / (1024 * 1024);

  console.log(`\n--- BENCHMARK RESULTS FOR ${batchSize.toLocaleString()} EVENTS ---`);
  console.log(`Total Time:                ${totalTimeMs.toFixed(2)} ms`);
  console.log(`Throughput:                ${throughput.toFixed(2)} events/sec`);
  console.log(`Average Latency:           ${avgLatency.toFixed(4)} ms`);
  console.log(`95th Percentile Latency:   ${p95Latency.toFixed(4)} ms`);
  console.log(`Maximum Latency:           ${maxLatency.toFixed(4)} ms`);
  console.log(`Memory Growth:             ${memoryGrowth.toFixed(2)} MB`);

  return {
    batchSize,
    totalTimeMs,
    throughput,
    avgLatency,
    p95Latency,
    maxLatency,
    memoryGrowth,
  };
}

async function startAll() {
  console.log("=== STARTING INSTRUMENTATION BENCHMARKS ===");
  initializeDatabase();

  const results1k = await runBenchmark(1000);
  const results10k = await runBenchmark(10000);
  const results50k = await runBenchmark(50000);

  console.log("\n=== BENCHMARK SUMMARY ===");
  console.log(
    "| Event Count | Total Time (ms) | Throughput (ev/s) | Avg Latency (ms) | p95 Latency (ms) | Memory Growth (MB) |",
  );
  console.log("| :--- | :--- | :--- | :--- | :--- | :--- |");

  [results1k, results10k, results50k].forEach((r) => {
    console.log(
      `| ${r.batchSize.toLocaleString()} | ${r.totalTimeMs.toFixed(1)} | ${r.throughput.toFixed(1)} | ${r.avgLatency.toFixed(4)} | ${r.p95Latency.toFixed(4)} | ${r.memoryGrowth.toFixed(2)} MB |`,
    );
  });

  process.exit(0);
}

startAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
