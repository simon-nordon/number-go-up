import { defineConfig } from "vite";

export default defineConfig(({ command, isPreview }) => ({
  // GitHub project Pages lives below the repository name; local dev stays at /.
  base: command === "build" || isPreview ? "/number-go-up/" : "/",
}));
