// Lightweight W3C Trace Context header generation for mobile requests.
//
// Phase F1 follow-up — the backend ships OpenTelemetry auto-instrumented
// HTTP spans (commit 828780ef) and the web frontend runs the full
// @opentelemetry/sdk-trace-web SDK. React Native does not have a usable
// OTel SDK without native bridges, and installing one is a much larger
// project than this follow-up warrants. What we CAN do cheaply is mint
// a W3C `traceparent` header per outbound request so the backend server
// span inherits a parent trace-id and every mobile request becomes
// greppable in the trace store.
//
// This is header-only propagation — we do not record client spans, we
// do not batch or export anything. When a full mobile SDK lands later,
// it can replace `buildTraceparent` with real span context without
// touching the axios interceptor wiring.
//
// Format (W3C Trace Context level 1):
//   traceparent: 00-<32 hex trace-id>-<16 hex span-id>-01
// where:
//   00  = version
//   01  = sampled flag (we sample every mobile request — volume is low
//         enough that sampling decisions are better made server-side)

/**
 * Generate `count` random hex characters. Uses Math.random because React
 * Native does not expose a synchronous secure RNG on the JS thread and
 * W3C traceparent IDs are correlation tokens, not secrets. If the app
 * later adds react-native-get-random-values for UUID generation the
 * underlying crypto.getRandomValues will transparently upgrade this.
 */
function randomHex(count: number): string {
  let out = '';
  while (out.length < count) {
    // 13 hex chars per Math.random() call is the safe slice length.
    out += Math.random().toString(16).slice(2, 15);
  }
  return out.slice(0, count);
}

/**
 * Build a fresh W3C traceparent header value. Called once per outbound
 * request; callers should not cache the result.
 */
export function buildTraceparent(): string {
  const traceId = randomHex(32);
  const spanId = randomHex(16);
  return `00-${traceId}-${spanId}-01`;
}
