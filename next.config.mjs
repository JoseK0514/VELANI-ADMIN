/** API application only. Builds never load a database or run migrations. */
export default {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingIncludes: { "/api/admin/v1/**": ["./db/migrations/*.sql"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
