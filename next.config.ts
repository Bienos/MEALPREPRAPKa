import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // History became the calendar; old links and the installed app's shortcut still work.
    return [{ source: "/historia", destination: "/kalendarz", permanent: true }];
  },
  async headers() {
    return [
      {
        // Food pictures change only with a deploy; let phones keep them for a day.
        source: "/food/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
