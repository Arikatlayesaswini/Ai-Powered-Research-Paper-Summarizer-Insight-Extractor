from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import fitz  # PyMuPDF
import uuid
import os
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from transformers import pipeline, MBart50Tokenizer, AutoModelForSeq2SeqLM
from typing import List, Dict, Any


app = FastAPI(title="AI Research Paper Summarizer API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)


EMBED_MODEL_NAME = "sentence-transformers/multi-qa-MiniLM-L6-cos-v1"


print("Loading embedding model...")
embed_model = SentenceTransformer(EMBED_MODEL_NAME)
EMBED_DIM = embed_model.get_sentence_embedding_dimension()


print("Loading summarizer model...")
summarizer = pipeline("summarization", model="facebook/bart-large-cnn")


print("Loading QA model...")
qa_pipeline = pipeline("question-answering", model="deepset/roberta-base-squad2")


print("Loading translation model...")
TRANSLATION_MODEL_NAME = "facebook/mbart-large-50-many-to-many-mmt"
translation_tokenizer = MBart50Tokenizer.from_pretrained(TRANSLATION_MODEL_NAME)
translation_model = AutoModelForSeq2SeqLM.from_pretrained(TRANSLATION_MODEL_NAME)


index = faiss.IndexFlatL2(EMBED_DIM)
metadata_store: Dict[int, Dict[str, Any]] = {}
next_vector_id = 0


def extract_text_from_pdf(path: str) -> str:
    try:
        doc = fitz.open(path)
        # OPTIONAL: limit pages for speed, e.g. first 10 pages
        pages = [page.get_text() for page in doc[:10]]
        text = "\n".join(pages)
        print("Extracted characters:", len(text))
        return text
    except Exception as e:
        print("PDF extraction error:", e)
        return ""


def chunk_text(text: str, size: int = 800, overlap: int = 150) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start = end - overlap
    print("Chunks created:", len(chunks))
    return chunks


def embed_texts(texts: List[str]) -> np.ndarray:
    embeddings = embed_model.encode(texts, normalize_embeddings=True)
    return np.array(embeddings).astype("float32")


def translate_text(text: str, target_lang: str) -> str:
    if not text.strip():
        return text

    lang_map = {
        "en": "en_XX",
        "hi": "hi_IN",
        "te": "te_IN",
        "fr": "fr_XX",
        "es": "es_XX",
    }

    target_lang = (target_lang or "en").lower()
    mbart_lang = lang_map.get(target_lang, "en_XX")

    if mbart_lang == "en_XX":
        return text

    try:
        translation_tokenizer.src_lang = "en_XX"
        inputs = translation_tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=1024,
        )
        generated_tokens = translation_model.generate(
            **inputs,
            forced_bos_token_id=translation_tokenizer.lang_code_to_id[mbart_lang],
            max_length=512,
            num_beams=4,
        )
        translated = translation_tokenizer.batch_decode(
            generated_tokens,
            skip_special_tokens=True,
        )[0]
        return translated
    except Exception as e:
        print("Translation error:", e)
        return text


def generate_summary(text: str, length: str = "medium", language: str = "en") -> str:
    if not text.strip():
        return "No content available."

    if length == "short":
        max_len, min_len = 80, 30
    elif length == "long":
        max_len, min_len = 220, 80
    else:
        max_len, min_len = 140, 50

    chunk_size = 700
    chunks = [text[i: i + chunk_size] for i in range(0, len(text), chunk_size)]

    summaries = []
    for chunk in chunks[:4]:
        try:
            result = summarizer(
                chunk,
                max_length=max_len,
                min_length=min_len,
                do_sample=False,
            )
            summaries.append(result[0]["summary_text"])
        except Exception as e:
            print("Summarization error:", e)

    if length == "short":
        summaries = summaries[:2]

    english_summary = " ".join(summaries)
    final_summary = translate_text(english_summary, target_lang=language)
    return final_summary


def ingest_pdf(file_path: str, paper_id: str) -> None:
    global next_vector_id

    print("Starting ingestion:", paper_id)
    text = extract_text_from_pdf(file_path)

    if not text.strip():
        print("No text extracted from PDF")
        return

    chunks = chunk_text(text)
    if not chunks:
        print("No chunks created")
        return

    embeddings = embed_texts(chunks)
    print("Embeddings shape:", embeddings.shape)

    for i, emb in enumerate(embeddings):
        index.add(np.expand_dims(emb, axis=0))
        metadata_store[next_vector_id] = {
            "paper_id": paper_id,
            "chunk_id": i,
            "text": chunks[i],
        }
        next_vector_id += 1

    print("Ingestion complete for", paper_id)
    print("Total stored chunks:", len(metadata_store), "index.ntotal:", index.ntotal)


def retrieve_chunks_for_question(paper_id: str, question: str, top_k: int = 3) -> List[str]:
    if index.ntotal == 0:
        return []

    q_emb = embed_model.encode([question], normalize_embeddings=True).astype("float32")
    distances, ids = index.search(q_emb, top_k * 5)

    chunks: List[str] = []
    seen = set()

    for idx in ids[0]:
        if idx == -1:
            continue
        meta = metadata_store.get(int(idx))
        if not meta:
            continue
        if meta["paper_id"] != paper_id:
            continue
        if meta["chunk_id"] in seen:
            continue

        chunks.append(meta["text"])
        seen.add(meta["chunk_id"])
        if len(chunks) >= top_k:
            break

    return chunks


# UPDATED: pure extractive QA so answer comes directly from the paper text
def answer_with_qa(question: str, context: str) -> str:
    if not context.strip():
        return "No relevant content found in the paper."

    try:
        result = qa_pipeline({"question": question, "context": context})
        answer = result.get("answer", "").strip()
        if not answer:
            return "No clear answer found for this question."
        return answer
    except Exception as e:
        print("QA error:", e)
        return "Could not generate answer."


class SummarizeRequest(BaseModel):
    paper_id: str
    length: str = "medium"
    language: str = "en"


class InsightRequest(BaseModel):
    paper_id: str
    questions: List[str]


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF allowed")

    paper_id = str(uuid.uuid4())
    save_path = os.path.join(DATA_DIR, f"{paper_id}.pdf")

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    print("File uploaded:", paper_id, "path:", save_path)

    # ingest synchronously so metadata_store is filled
    ingest_pdf(save_path, paper_id)

    return {"paper_id": paper_id, "message": "PDF uploaded and processed."}


@app.post("/summarize")
def summarize(req: SummarizeRequest):
    print("Summarize called for", req.paper_id)
    retrieved = [m["text"] for m in metadata_store.values() if m["paper_id"] == req.paper_id]
    print("Retrieved chunks for summary:", len(retrieved))

    if not retrieved:
        return {
            "status": "processing",
            "message": "Paper still processing. Try again in a few seconds.",
        }

    paper_text = " ".join(retrieved[:8])
    summary = generate_summary(paper_text, length=req.length, language=req.language)
    return {"summary": summary, "language": req.language}


@app.post("/insights")
def insights(req: InsightRequest):
    print("Insights called for", req.paper_id)
    paper_chunks = [m["text"] for m in metadata_store.values() if m["paper_id"] == req.paper_id]
    print("Paper chunks for insights:", len(paper_chunks))

    if not paper_chunks:
        return {"status": "processing", "message": "Paper still processing."}

    answers: Dict[str, str] = {}
    for question in req.questions:
        chunks = retrieve_chunks_for_question(req.paper_id, question, top_k=3)
        if not chunks:
            chunks = paper_chunks[:3]

        context = "\n".join(chunks)
        answer = answer_with_qa(question, context)
        answers[question] = answer

    return {"insights": answers}


@app.get("/debug")
def debug():
    return {"stored_vectors": index.ntotal, "metadata_entries": len(metadata_store)}
