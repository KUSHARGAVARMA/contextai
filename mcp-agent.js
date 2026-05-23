import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ragQuery } from "./rag-drive.js";
import * as dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic();

async function runDriveAgent(userQuestion) {
  console.log("\n🔍 Question:", userQuestion);

  // Connect to MCP Server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["drive-mcp-server.js"],
  });

  const mcpClient = new Client({ name: "drive-agent", version: "1.0.0" });
  await mcpClient.connect(transport);

  // Get available tools from MCP server
  const { tools } = await mcpClient.listTools();

  // Convert MCP tools to Anthropic format
  const anthropicTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));

  const messages = [{ role: "user", content: userQuestion }];

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      tools: anthropicTools,
      messages: messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((b) => b.type === "tool_use");

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          console.log(`\n📂 Calling tool: ${toolUse.name}`, toolUse.input);

          let result;

          // If reading a file — use RAG instead of raw content
          if (toolUse.name === "read_file") {
            const rawResult = await mcpClient.callTool({
              name: toolUse.name,
              arguments: toolUse.input,
            });

            const fileText = rawResult.content[0].text;
            const fileName = toolUse.input.fileId;

            console.log("\n🧠 Running RAG on file...");
            const relevantChunks = await ragQuery(
              userQuestion,
              toolUse.input.fileId,
              fileName,
              fileText,
            );

            result = relevantChunks;
          } else {
            // For other tools — call normally
            const rawResult = await mcpClient.callTool({
              name: toolUse.name,
              arguments: toolUse.input,
            });
            result = rawResult.content[0].text;
          }

          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          };
        }),
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    } else {
      const finalAnswer = response.content.find((b) => b.type === "text");
      console.log("\n✅ Answer:", finalAnswer.text);
      break;
    }
  }

  await mcpClient.close();
}

runDriveAgent("What are Kushagra Varma's key skills from his resume?");
