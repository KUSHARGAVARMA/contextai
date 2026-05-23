import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import * as dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic();
const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

// Tool definition - tells Claude it can search the web
const tools = [
  {
    name: "web_search",
    description: "Search the web for current information on any topic",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
];

// Execute the search
async function webSearch(query) {
  const response = await tavilyClient.search(query, {
    maxResults: 3,
  });
  return JSON.stringify(response.results);
}

// Main agent loop
async function runAgent(userQuestion) {
  console.log("\n🔍 Question:", userQuestion);

  const messages = [{ role: "user", content: userQuestion }];

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      tools: tools,
      messages: messages,
    });

    if (response.stop_reason === "tool_use") {
      // Get ALL tool calls — however many Claude decides
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      console.log(`\n📦 Claude wants to make ${toolUses.length} searches`);

      // Execute ALL searches in parallel
      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          console.log("🌐 Searching for:", toolUse.input.query);
          const searchResults = await webSearch(toolUse.input.query);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: searchResults,
          };
        }),
      );

      // Add everything to history
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    } else {
      // Claude has final answer
      const finalAnswer = response.content.find((b) => b.type === "text");
      console.log("\n✅ Answer:", finalAnswer.text);
      break;
    }
  }
}

// Complex research question
runAgent(
  "what are some of the best schools in Greater noida and Noida to apply for teaching jobs? What are the pros and cons of each?",
);
