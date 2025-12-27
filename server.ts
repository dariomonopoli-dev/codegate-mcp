import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

const CODEGATE_BASE_URL = (process.env.CODEGATE_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");

const Requirement = z.object({
  name: z.string(),
  version: z.string().optional(),
  raw: z.string(),
});

const AuthorizeInput = z.object({
  requirements: z.array(Requirement),
});

const server = new Server(
  { name: "codegate", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "codegate_authorize_pip",
        description:
          "Checks pip requirements against CodeGate policy (Safe Chain-backed). Returns allow/deny and per-package reasons.",
        inputSchema: {
          type: "object",
          properties: {
            requirements: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  version: { type: "string" },
                  raw: { type: "string" },
                },
                required: ["name", "raw"],
              },
            },
          },
          required: ["requirements"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const toolName = req.params.name;
  const args = req.params.arguments ?? {};

  if (toolName !== "codegate_authorize_pip") {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const parsed = AuthorizeInput.parse(args);

  const res = await fetch(`${CODEGATE_BASE_URL}/authorize/pip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed),
  });

  const bodyText = await res.text();
  let bodyJson: any = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    bodyJson = { error: "Non-JSON response from CodeGate", raw: bodyText };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            codegate_base_url: CODEGATE_BASE_URL,
            http_status: res.status,
            result: bodyJson,
          },
          null,
          2
        ),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
