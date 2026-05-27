import { Pinecone } from "@pinecone-database/pinecone";
import { google } from "googleapis";
import fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

// Initialize Pinecone v7
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index({
  host: "https://drive-rag-plain-1vdmcz2.svc.aped-4627-b74a.pinecone.io",
});

// Voyage AI — generate embeddings via HTTP
async function generateEmbeddings(texts) {
  const BATCH_SIZE = 10;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(
      `   Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`,
    );

    // Wait 25 seconds between batches to respect 3 RPM limit
    if (i > 0) {
      console.log("   ⏳ Rate limit pause...");
      await new Promise((r) => setTimeout(r, 1000));
    }

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: batch,
        model: "voyage-3",
      }),
    });

    const data = await response.json();

    if (!data.data) {
      console.log("Voyage error:", JSON.stringify(data));
      throw new Error("Voyage API failed");
    }

    allEmbeddings.push(...data.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}

// Google Auth
async function getAuth() {
  const credentials = JSON.parse(fs.readFileSync("credentials.json"));
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );
  const token = JSON.parse(fs.readFileSync("token.json"));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

// Step 1 — Chunk text
function chunkText(text, chunkSize = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// Step 2 — Cache check
async function isFileIndexed(fileId) {
  try {
    const embeddings = await generateEmbeddings(["test"]);
    const results = await index.query({
      vector: embeddings[0],
      topK: 1,
      filter: { fileId: { $eq: fileId } },
      includeMetadata: true,
    });
    return results.matches && results.matches.length > 0;
  } catch {
    return false;
  }
}

// Step 3 — Index a file
async function indexFile(fileId, fileName, text) {
  console.log(`📄 Indexing: ${fileName}`);

  const chunks = chunkText(text);
  console.log(`   ${chunks.length} chunks created`);

  const embeddings = await generateEmbeddings(chunks);
  console.log(`   ${embeddings.length} embeddings generated`);

  const vectors = embeddings.map((embedding, i) => ({
    id: `${fileId}_chunk_${i}`,
    values: embedding,
    metadata: {
      fileId,
      fileName,
      text: chunks[i],
      chunkIndex: i,
    },
  }));

  // v7 syntax
  await index.upsert({ records: vectors });
  console.log(`   ✅ Indexed ${vectors.length} chunks`);
}

// Step 4 — Search relevant chunks
async function searchChunks(question, topK = 3) {
  const embeddings = await generateEmbeddings([question]);

  const results = await index.query({
    vector: embeddings[0],
    topK,
    includeMetadata: true,
  });

  return results.matches.map((m) => m.metadata.text);
}

// Step 5 — Main RAG function
export async function ragQuery(question, fileId, fileName, fileText) {
  console.log("\n🔍 RAG Query:", question);

  const cached = await isFileIndexed(fileId);

  if (cached) {
    console.log("⚡ Cache hit — using existing embeddings");
  } else {
    console.log("🆕 New file — indexing now...");
    await indexFile(fileId, fileName, fileText);
  }

  const relevantChunks = await searchChunks(question);
  console.log(`📦 Found ${relevantChunks.length} relevant chunks`);

  // Return text + source citation
  return {
    text: relevantChunks.join("\n\n"),
    source: fileName,
  };
}

// // Test
// const testText = `
// Kushagra Varma
// B.Tech Computer Science
// Semester 1: 8.2 CGPA
// Semester 2: 8.4 CGPA
// Semester 3: 8.1 CGPA
// Semester 4: 8.6 CGPA
// Semester 5: 8.3 CGPA
// Semester 6: 8.5 CGPA
// Semester 7: 8.4 CGPA
// Semester 8: 8.7 CGPA — Final Semester
// Overall CGPA: 8.4
// `;

// const result = await ragQuery(
//   "What was Kushagra's B.Tech final semester CGPA?",
//   "test_file_001",
//   "marksheet.txt",
//   testText,
// );

// console.log("\n📋 Relevant chunks found:\n", result);
