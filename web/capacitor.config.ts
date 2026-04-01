import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.gov.pnit",
  appName: "PNIT",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
