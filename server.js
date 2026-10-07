import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server Running on ${PORT}`);
});