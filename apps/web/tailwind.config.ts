import type { Config } from "tailwindcss";
import preset from "@payce/config/tailwind";

export default {
  presets: [preset],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
} satisfies Config;
