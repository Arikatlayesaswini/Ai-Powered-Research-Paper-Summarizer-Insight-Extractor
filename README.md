# AI Powered Research Paper Summarizer & Insight Extractor
AI-powered web application that ingests research papers in PDF format, generates concise abstractive summaries, and answers user questions about the content. The system supports multilingual summaries and provides an interactive, card-based web interface.
## Overview

This project implements an end-to-end NLP pipeline for assisting users in quickly understanding long, technical research papers. Users can:

- Upload a PDF paper
- Obtain short / medium / long summaries
- View key insights
- Ask natural-language questions about the document
- Receive the summary in multiple languages (e.g., English, Hindi, Telugu)

The application combines modern Transformer-based models with semantic search and a clean, multi-page frontend.



## Key Features

- **PDF Ingestion & Text Extraction**  
  - Upload research papers as PDF files  
  - Extract text using PyMuPDF (`fitz`)  

- **Abstractive Summarization**  
  - Generate summaries using `facebook/bart-large-cnn`  
  - Configurable summary length: `short`, `medium`, `long`  

- **Multilingual Summaries**  
  - Base summary generated in English  
  - Translated into multiple target languages using `facebook/mbart-large-50-many-to-many-mmt` (mBART-50) with `MBart50Tokenizer` and `AutoModelForSeq2SeqLM`  
  - Language selected via a `language` parameter in the API request  

- **Semantic Retrieval with FAISS**  
  - Chunking of extracted text with overlap  
  - Embedding generation using `sentence-transformers/multi-qa-MiniLM-L6-cos-v1`  
  - Storage of embeddings in a FAISS index for efficient semantic similarity search  

- **Question Answering (QA)**  
  - For each user question, relevant chunks are retrieved from FAISS  
  - Answers are generated using `deepset/roberta-base-squad2`, grounded in the uploaded document  

- **Modern Web UI**  
  - Multi-page HTML/CSS/JavaScript frontend  
  - Pages: `login.html`, `index.html`, `summary.html`, `insights.html`, `qa.html`  
  - Card-based layout with responsive design and simple login gate using `localStorage`  

---

## Architecture

### Backend

- **Framework:** FastAPI (Python)
- **PDF Handling:** PyMuPDF (`fitz`)
- **Embeddings:** SentenceTransformers (`multi-qa-MiniLM-L6-cos-v1`)
- **Vector Index:** FAISS (L2 index)
- **Summarization:** `facebook/bart-large-cnn`
- **Translation:** `facebook/mbart-large-50-many-to-many-mmt`
- **Question Answering:** `deepset/roberta-base-squad2`
- **Storage:**
  - Uploaded PDFs: `data/<paper_id>.pdf`
  - In-memory FAISS index + Python metadata dictionary for chunks

Core backend responsibilities:

- Handle PDF upload, ingestion, and indexing  
- Expose REST endpoints for summarization, insights, and debugging  
- Coordinate summarization, translation, and QA pipelines  

### Frontend

- **Stack:** Vanilla HTML, CSS, JavaScript
- **Pages:**
  - `login.html` – simple login form; on success sets `localStorage.loggedIn`
  - `index.html` – main landing page with navigation cards
  - `summary.html` – summary generation UI
  - `insights.html` – key insights / predefined questions
  - `qa.html` – free-form question answering
- **Styling:** Custom `style.css` with card UI and gradient backgrounds
- **Integration:** Frontend pages call the FastAPI backend over HTTP (e.g., `http://127.0.0.1:8000`)

---

## API Endpoints

### `POST /upload`

Upload and ingest a PDF.

- **Request:** `multipart/form-data` with `file` (PDF)  
- **Response:**
```json
{
  "paper_id": "<uuid>",
  "message": "PDF uploaded and processed."
}
```

### `POST /summarize`

Generate a summary (optionally multilingual) for a given paper.

- **Request body:**
```json
{
  "paper_id": "<uuid>",
  "length": "short | medium | long",
  "language": "en | hi | te | fr | es"
}
```

- **Response:**
```json
{
  "summary": "<summary_text>",
  "language": "<language_code>"
}
```

### `POST /insights`

Answer multiple questions about a given paper.

- **Request body:**
```json
{
  "paper_id": "<uuid>",
  "questions": ["question 1", "question 2"]
}
```

- **Response:**
```json
{
  "insights": {
    "question 1": "answer 1",
    "question 2": "answer 2"
  }
}
```

### `GET /debug`

Simple diagnostic endpoint.

- **Response:**
```json
{
  "stored_vectors": <int>,
  "metadata_entries": <int>
}
```

---

## Setup and Usage

### 1. Backend Setup

Create and activate a virtual environment (optional but recommended):

```bash
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux / macOS
```

Install dependencies:

```bash
pip install fastapi uvicorn python-multipart
pip install pymupdf faiss-cpu sentence-transformers transformers torch torchvision torchaudio
```

Ensure a `data/` directory exists (for uploaded PDFs):

```bash
mkdir data
```

Run the FastAPI application (assuming file is `app.py` and app instance is `app`):

```bash
uvicorn app:app --reload --port 8000
```

Open API docs at: `http://127.0.0.1:8000/docs`

### 2. Frontend Setup

This project uses static HTML/JS, so no build step is required.

Option 1 – Open directly:
- Open `login.html` in a browser  
- The login page redirects to `index.html` on success

Option 2 – Serve via simple HTTP server:

```bash
python -m http.server 5500
```

Then visit:

- `http://localhost:5500/login.html`  
- Make sure any frontend JS files point to `http://127.0.0.1:8000` (or your chosen backend URL).

---

## Project Objectives

- Provide a practical tool for quickly understanding long research papers.
- Demonstrate integration of multiple NLP components:
  - Abstractive summarization
  - Multilingual translation
  - Semantic search with vector embeddings
  - Extractive QA
- Deliver an end-to-end solution covering backend APIs, NLP pipeline, and user-facing frontend.

---

## Future Enhancements

- Robust user authentication and authorization (beyond simple localStorage login).
- Persistent vector index storage and support for large-scale document collections.
- Additional language support and automatic source-language detection.
- Improved UI/UX, loading indicators, and detailed error feedback.
- Containerization (Docker) and deployment to a cloud platform.

---

## Disclaimer

This project is intended for educational and demonstration purposes.  
Before using it in production or commercial settings, review the licenses and usage terms for all third-party models and libraries (e.g., BART, mBART-50, SentenceTransformers, FAISS, PyTorch, etc.).
