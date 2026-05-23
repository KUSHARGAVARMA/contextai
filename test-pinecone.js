import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";
dotenv.config();

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index({
  host: "https://drive-rag-plain-1vdmcz2.svc.aped-4627-b74a.pinecone.io",
});

await index.upsert({
  records: [
    {
      id: "test_001",
      values: new Array(1024).fill(0.1),
      metadata: { text: "hello world" },
    },
  ],
});

console.log("✅ Success!");
