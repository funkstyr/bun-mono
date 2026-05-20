import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const serviceName = process.env["OTEL_SERVICE_NAME"] || "bun-mono-server";
const serviceVersion = process.env["OTEL_SERVICE_VERSION"] || "1.0.0";
const environment = process.env.NODE_ENV || "development";

const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] || "http://localhost:4318";

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  "deployment.environment.name": environment,
});

const traceExporter = new OTLPTraceExporter({
  url: `${otlpEndpoint}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${otlpEndpoint}/v1/metrics`,
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
      "@opentelemetry/instrumentation-http": {
        enabled: true,
      },
    }),
  ],
});

// Must be called before any other imports — auto-instrumentations patch
// modules on require, so anything loaded earlier won't be traced.
export function startTracing(): void {
  sdk.start();
  console.log(`[OpenTelemetry] Tracing started for service: ${serviceName}`);
  console.log(`[OpenTelemetry] Exporting to: ${otlpEndpoint}`);
}

export async function shutdownTracing(): Promise<void> {
  try {
    await sdk.shutdown();
    console.log("[OpenTelemetry] Tracing shutdown complete");
  } catch (error) {
    console.error("[OpenTelemetry] Error shutting down tracing:", error);
  }
}

export { trace, context, SpanStatusCode } from "@opentelemetry/api";
