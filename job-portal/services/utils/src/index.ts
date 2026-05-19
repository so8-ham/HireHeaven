import express from "express";
import dotenv from "dotenv";
import routes from "./routes.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";
import { startSendMailConsumer } from "./consumer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../uploads");

dotenv.config();

startSendMailConsumer();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const app = express();
app.use(cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/uploads", express.static(uploadsDir));
app.use("/api/utils", routes);

app.listen(process.env.PORT, () => {
  console.log(
    `Utils Service is running on http://localhost:${process.env.PORT}`
  );
});
