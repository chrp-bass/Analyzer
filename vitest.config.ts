import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` exists to make importing a server module from a client
      // component a build error. Under Vitest we ARE the server, so it
      // resolves to a no-op — the guarantee is enforced by `next build`,
      // which still runs in CI.
      "server-only": path.resolve(__dirname, "tests/support/server-only.ts"),
    },
  },
  // Component tests render with react-dom/server under Node; the automatic
  // JSX runtime lets vitest compile .tsx without touching Next's tsconfig.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
