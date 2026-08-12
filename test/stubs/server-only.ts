// Test-only stub. The real "server-only" package throws unconditionally when
// resolved outside Next.js's bundler (it relies on Next.js swapping it for a
// no-op in server contexts) -- vitest.config.ts aliases "server-only" to this
// empty module so lib/*.ts can be imported directly in tests.
export {};
