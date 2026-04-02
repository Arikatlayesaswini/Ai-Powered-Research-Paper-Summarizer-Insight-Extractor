let paper_id = "";

document.addEventListener("DOMContentLoaded", () => {
  paper_id = localStorage.getItem("paper_id") || "";

  if (!paper_id) {
    setResult("Please upload a PDF on the Summary page first.");
  } else {
    setResult("Ready. Type your question and click 'Ask'.");
  }

  document.getElementById("askBtn").addEventListener("click", askQuestion);
});

function setResult(text) {
  document.getElementById("result").innerText = text;
}

async function askQuestion() {
  if (!paper_id) {
    alert("Please upload a PDF on the Summary page first.");
    return;
  }

  const input = document.getElementById("question");
  const question = input.value.trim();
  if (!question) {
    alert("Please type a question.");
    return;
  }

  setResult("Getting answer...");

  try {
    const response = await fetch("http://127.0.0.1:8000/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper_id, questions: [question] }),
    });

    const data = await response.json();
    if (data.status === "processing") {
      setResult("⏳ Paper is still processing. Try again in a few seconds.");
      return;
    }

    const answer =
      data.insights && data.insights[question]
        ? data.insights[question]
        : "No answer.";
    setResult(`Q: ${question}\n\nA: ${answer}`);
  } catch (error) {
    console.error("Ask question error:", error);
    setResult("❌ Failed to get answer.");
  }
}
