const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting middleware
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 upload requests per windowMs
  message: "Too many PDF uploads from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 questions per windowMs
  message: "Too many questions asked, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

const summarizeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 summarizations per windowMs
  message: "Too many summarization requests, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// Storage for uploaded PDFs with file size limit (10MB)
const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Use form field name 'file'." });
    }

    // Validate file type
    if (req.file.mimetype !== "application/pdf") {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(400).json({ error: "Invalid file type. Only PDF files are allowed." });
    }

    // Validate file size (not empty)
    if (req.file.size === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Uploaded file is empty. Please upload a valid PDF." });
    }

    // Validate PDF header
    const buffer = fs.readFileSync(req.file.path);
    const isPDF = buffer.toString('utf8', 0, 4) === '%PDF';
    if (!isPDF) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "File is corrupted or not a valid PDF." });
    }

    const filePath = path.join(__dirname, req.file.path);
    const response = await axios.post("http://localhost:5000/process-pdf", {
      filePath,
    });

    res.json({ doc_id: response.data.doc_id });
  } catch (err) {
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
    }
    
    const details = err.response?.data?.detail || err.response?.data?.error || err.message;
    console.error("Upload processing failed:", details);
    res.status(500).json({ error: "PDF processing failed", details });
  }
});

app.post("/ask", async (req, res) => {
  const response = await axios.post("http://localhost:5000/ask", req.body);
  res.json(response.data);
});

app.post("/summarize", async (req, res) => {
  const response = await axios.post("http://localhost:5000/summarize", req.body);
  res.json(response.data);
});

app.post("/compare", async (req, res) => {
  try {
    const response = await axios.post("http://localhost:5000/compare", req.body);
    res.json({ comparison: response.data.comparison });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Error comparing documents" });
  }
});

app.listen(4000, () => console.log("Backend running on http://localhost:4000"));