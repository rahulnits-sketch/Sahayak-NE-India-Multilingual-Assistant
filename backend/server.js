require("dotenv").config();
const express = require("express");
const cors = require("cors");

const chatRoutes = require("./routes/chat");
const speechRoutes = require("./routes/speech");
const miscRoutes = require("./routes/misc");
const whatsappRoutes = require("./routes/whatsapp");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // audio payloads need a larger limit
app.use(express.urlencoded({ extended: true })); // Twilio's WhatsApp webhook sends form-encoded data

app.use("/api", chatRoutes);
app.use("/api", speechRoutes);
app.use("/api", miscRoutes);
app.use("/api", whatsappRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "NE Multilingual Assistant API running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
