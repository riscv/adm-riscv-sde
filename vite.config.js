import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  base: isGitHubPages ? "/adm-riscv-sde/" : "/",
  plugins: [react()],
  server: {
    port: 5038
  }
});
