let paper_id = "";
let lastSummaryText = "";
let lastSummaryLanguage = "en";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("uploadBtn").addEventListener("click", uploadPDF);
  document.getElementById("summaryBtn").addEventListener("click", getSummary);
  document
    .getElementById("downloadSummaryBtn")
    .addEventListener("click", chooseFormatAndDownload);
  document
    .getElementById("copySummaryBtn")
    .addEventListener("click", copySummaryToClipboard);
  document
    .getElementById("keyPointsBtn")
    .addEventListener("click", generateKeyPoints);

  const langSelect = document.getElementById("summaryLanguage");
  langSelect.addEventListener("change", () => {
    lastSummaryLanguage = langSelect.value;
  });

  setResult("Upload a PDF to begin.");
});

function setResult(text) {
  document.getElementById("result").innerText = text;

  const hasSummary = lastSummaryText && lastSummaryText.trim().length > 0;
  document.getElementById("downloadSummaryBtn").disabled = !hasSummary;
  document.getElementById("copySummaryBtn").disabled = !hasSummary;
  document.getElementById("keyPointsBtn").disabled = !hasSummary;
}

async function uploadPDF() {
  const fileInput = document.getElementById("pdfFile");
  const uploadBtn = document.getElementById("uploadBtn");

  if (fileInput.files.length === 0) {
    alert("Please select a PDF file");
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  setResult("Uploading PDF...");
  uploadBtn.disabled = true;

  try {
    const response = await fetch("http://127.0.0.1:8000/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Upload failed");

    paper_id = data.paper_id;
    // make available to other pages
    localStorage.setItem("paper_id", paper_id);

    lastSummaryText = "";
    clearKeyPoints();
    setResult(
      "✅ PDF uploaded.\n\nNow choose length and language, then click 'Get Summary'."
    );
  } catch (error) {
    console.error("Upload error:", error);
    setResult("❌ Upload failed. Check backend.");
  } finally {
    uploadBtn.disabled = false;
  }
}

async function getSummary() {
  if (!paper_id) {
    alert("Upload a PDF first.");
    return;
  }

  const radios = document.querySelectorAll('input[name="summaryLength"]');
  let length = "medium";
  radios.forEach((r) => {
    if (r.checked) length = r.value;
  });

  const langSelect = document.getElementById("summaryLanguage");
  lastSummaryLanguage = langSelect.value;

  setResult("Generating " + length + " summary...");

  try {
    const response = await fetch("http://127.0.0.1:8000/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper_id, length, language: lastSummaryLanguage }),
    });

    const data = await response.json();

    if (data.status === "processing") {
      setResult("⏳ Paper is still processing. Try again in a few seconds.");
      return;
    }

    const summaryBody = data.summary || "No summary available.";

    const text =
      "📄 " +
      length.toUpperCase() +
      " SUMMARY (" +
      languageLabel(lastSummaryLanguage) +
      "):\n\n" +
      summaryBody;

    lastSummaryText = text;
    clearKeyPoints();
    setResult(text);
  } catch (error) {
    console.error("Summary error:", error);
    setResult("❌ Failed to get summary.");
  }
}

// COPY
async function copySummaryToClipboard() {
  if (!lastSummaryText || !lastSummaryText.trim()) {
    alert("No summary to copy. Please generate a summary first.");
    return;
  }
  try {
    await navigator.clipboard.writeText(lastSummaryText);
    alert("Summary copied to clipboard.");
  } catch (err) {
    console.error("Clipboard error:", err);
    alert("Could not copy. Please copy manually.");
  }
}

// DOWNLOAD
function chooseFormatAndDownload() {
  if (!lastSummaryText || !lastSummaryText.trim()) {
    alert("No summary available to download. Please generate a summary first.");
    return;
  }

  const choice = prompt(
    "Which format do you want?\n1 = TXT\n2 = PDF\n3 = DOCX"
  );
  if (!choice) return;

  if (choice === "1") downloadTxt();
  else if (choice === "2") downloadPdf();
  else if (choice === "3") downloadDocx();
  else alert("Invalid choice. Please enter 1, 2, or 3.");
}

function downloadTxt() {
  const text = lastSummaryText.trim();
  const blob = new Blob([text], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "paper_summary.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function downloadPdf() {
  const text = lastSummaryText.trim();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margin = 10;
  const maxWidth = 190;
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, margin, 20);
  doc.save("paper_summary.pdf");
}

function downloadDocx() {
  const text = lastSummaryText.trim();
  const header =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>";
  const footer = "</w:body></w:document>";

  const safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const body = "<w:p><w:r><w:t>" + safeText + "</w:t></w:r></w:p>";
  const content = header + body + footer;

  const blob = new Blob([content], {
    type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "paper_summary.docx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// KEY POINTS
function generateKeyPoints() {
  if (!lastSummaryText || !lastSummaryText.trim()) {
    alert("No summary available. Please generate a summary first.");
    return;
  }

  const parts = lastSummaryText.split("\n\n");
  const summaryBody = parts.slice(1).join("\n\n") || lastSummaryText;

  const sentences = summaryBody
    .split(/[\.\?\!]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const keyPointsList = document.getElementById("keyPointsList");
  keyPointsList.innerHTML = "";

  const maxPoints = 5;
  sentences.slice(0, maxPoints).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.endsWith(".") ? s : s + ".";
    keyPointsList.appendChild(li);
  });

  if (sentences.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No clear key points could be extracted.";
    keyPointsList.appendChild(li);
  }
}

function clearKeyPoints() {
  const keyPointsList = document.getElementById("keyPointsList");
  if (keyPointsList) keyPointsList.innerHTML = "";
}

function languageLabel(code) {
  if (code === "te") return "Telugu";
  if (code === "hi") return "Hindi";
  return "English";
}
