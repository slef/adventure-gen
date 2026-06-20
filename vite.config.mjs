import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import civet from "@danielx/civet/vite";

export default defineConfig({
  base: "./",
  plugins: [civet({ ts: "esbuild" }), solid()],
});
