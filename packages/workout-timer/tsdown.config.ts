import { browserPreset } from "@bun-mono/config/tsdown";

export default browserPreset({
  copy: [{ from: "src/styles.css", to: "dist/styles.css" }],
});
