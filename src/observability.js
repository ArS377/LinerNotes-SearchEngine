import * as Sentry from "@sentry/node";
import { metrics, trace, SpanStatusCode } from "@opentelemetry/api";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.OTEL_TRACE_SAMPLE_RATE || 0.1),
    sendDefaultPii: false
  });
}

const tracer = trace.getTracer("liner-notes-api");
const meter = metrics.getMeter("liner-notes-api");
const requests = meter.createCounter("liner_notes.http.requests");
const latency = meter.createHistogram("liner_notes.http.duration_ms");

export async function observeRequest(request, response, operation) {
  const route = new URL(request.url, "http://liner-notes.local").pathname;
  const started = performance.now();
  return tracer.startActiveSpan(`${request.method} ${route}`, async (span) => {
    span.setAttributes({
      "http.request.method": request.method,
      "url.path": route
    });
    try {
      const result = await operation();
      span.setAttribute("http.response.status_code", response.statusCode);
      if (response.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      Sentry.captureException(error);
      throw error;
    } finally {
      const attributes = { route, method: request.method, status: response.statusCode };
      requests.add(1, attributes);
      latency.record(performance.now() - started, attributes);
      span.end();
    }
  });
}

export function logEvent(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields
  };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else console.log(output);
}
