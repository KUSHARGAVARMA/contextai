import { google } from "googleapis";
import fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_id, client_secret, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
);
const token = JSON.parse(fs.readFileSync("token.json"));
oAuth2Client.setCredentials(token);

const drive = google.drive({ version: "v3", auth: oAuth2Client });
const response = await drive.files.list({
  pageSize: 5,
  fields: "files(id, name)",
});

console.log("Files found:", response.data.files);
