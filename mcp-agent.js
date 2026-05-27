import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ragQuery } from "./rag-drive.js";
import * as dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic();

async function runDriveAgent(userQuestion) {
  console.log("\n🔍 Question:", userQuestion);

  const transport = new StdioClientTransport({
    command: "node",
    args: ["drive-mcp-server.js"],
  });

  const mcpClient = new Client({ name: "drive-agent", version: "1.0.0" });
  await mcpClient.connect(transport);

  const { tools } = await mcpClient.listTools();

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
      system:
        "When answering questions about documents, always mention the source file name AND the link at the beginning of your answer. For example: 'Based on [filename](link), here is...' — always include the link if provided in the source.",
      tools: anthropicTools,
      messages: messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((b) => b.type === "tool_use");

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          console.log(`\n📂 Calling tool: ${toolUse.name}`, toolUse.input);

          let result;

          if (toolUse.name === "read_file") {
            const rawResult = await mcpClient.callTool({
              name: toolUse.name,
              arguments: toolUse.input,
            });

            const fileText = rawResult.content[0].text;

            // Extract real file name from content
            const fileNameMatch = fileText.match(/\[File: (.+?)\]/);
            const extractedName = fileNameMatch
              ? fileNameMatch[1]
              : toolUse.input.fileId;

            console.log("\n🧠 Running RAG on file...");
            const ragResult = await ragQuery(
              userQuestion,
              toolUse.input.fileId,
              extractedName,
              fileText,
            );

            // Citation with real file name
            // Get file link
            const linkResult = await mcpClient.callTool({
              name: "get_file_link",
              arguments: { fileId: toolUse.input.fileId },
            });
            const linkText = linkResult.content[0].text;
            const viewLink = linkText.match(/View: (.+)/)?.[1] || "";

            result = `[Source: ${extractedName} — ${viewLink}]\n\n${ragResult.text}`;
          } else {
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

runDriveAgent("Summarise Kushagra Varma's AADHAAR card details");
