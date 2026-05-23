import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import readline from "readline";
import { z } from "zod";

// Google Auth Setup
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const TOKEN_PATH = "token.json";
const CREDENTIALS_PATH = "credentials.json";

async function authenticate() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );

  // Check if token exists
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Get new token
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("Authorize this app by visiting:\n", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("\nEnter the code from that page: ", async (code) => {
      rl.close();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log("Token saved!");
      resolve(oAuth2Client);
    });
  });
}

// MCP Server Setup
const server = new McpServer({
  name: "google-drive",
  version: "1.0.0",
});

// Tool 1 — List files
server.tool(
  "list_files",
  { query: z.string().optional() },
  async ({ query }) => {
    const auth = await authenticate();
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.list({
      q: query ? `name contains '${query}'` : undefined,
      pageSize: 10,
      fields: "files(id, name, mimeType, modifiedTime)",
    });

    const files = response.data.files;
    if (!files || files.length === 0) {
      return { content: [{ type: "text", text: "No files found." }] };
    }

    const fileList = files
      .map((f) => `📄 ${f.name} | ID: ${f.id} | modified: ${f.modifiedTime}`)
      .join("\n");

    return { content: [{ type: "text", text: fileList }] };
  },
);

// Tool 2 — Read a file
server.tool("read_file", { fileId: z.string() }, async ({ fileId }) => {
  const auth = await authenticate();
  const drive = google.drive({ version: "v3", auth });

  try {
    // Try export for Google Docs first
    const response = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return { content: [{ type: "text", text: response.data }] };
  } catch {
    // For PDFs — download raw content
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" },
    );
    return { content: [{ type: "text", text: String(response.data) }] };
  }
});
server.tool("get_file_link", { fileId: z.string() }, async ({ fileId }) => {
  const auth = await authenticate();
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.get({
    fileId,
    fields: "id, name, webViewLink, webContentLink",
  });

  const file = response.data;
  return {
    content: [
      {
        type: "text",
        text: `File: ${file.name}\nView: ${file.webViewLink}\nDownload: ${file.webContentLink}`,
      },
    ],
  };
});

// Test auth first
// const auth = await authenticate();
// console.log("Auth successful!", auth.credentials);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Google Drive MCP Server running...");
