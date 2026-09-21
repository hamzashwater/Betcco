import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const certificatePath = requiredEnv("BETCCO_UAT_TLS_CERT");
const keyPath = requiredEnv("BETCCO_UAT_TLS_KEY");
const upstream = new URL(
  process.env.BETCCO_UAT_UPSTREAM_URL ?? "http://127.0.0.1:3001",
);
const port = Number(process.env.BETCCO_UAT_TLS_PORT ?? "3000");

const server = https.createServer(
  {
    cert: readFileSync(certificatePath),
    key: readFileSync(keyPath),
  },
  (request, response) => {
    const proxyRequest = http.request(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        method: request.method,
        path: request.url,
        headers: {
          ...request.headers,
          "x-forwarded-host": request.headers.host ?? "localhost:3000",
          "x-forwarded-proto": "https",
        },
      },
      (proxyResponse) => {
        response.writeHead(
          proxyResponse.statusCode ?? 502,
          proxyResponse.headers,
        );
        proxyResponse.pipe(response);
      },
    );

    proxyRequest.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end("UAT upstream unavailable");
    });
    request.pipe(proxyRequest);
  },
);

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing required UAT environment variable: ${name}`);
  return value;
}
