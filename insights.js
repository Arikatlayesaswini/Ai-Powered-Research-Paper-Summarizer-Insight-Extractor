let paper_id = "";

document.addEventListener("DOMContentLoaded", () => {
  paper_id = localStorage.getItem("paper_id") || "";

  if (!paper_id) {
    setResult("Please upload a PDF on the Summary page first.");
  } else {
    setResult("Ready. Click 'Get Key Insights' to generate insights.");
  }

  document.getElementById("insightsBtn").addEventListener("click", getInsights);
});

function setResult(text) {
  document.getElementById("result").innerText = text;
}

async function getInsights() {
  if (!paper_id) {
    alert("Please upload a PDF on the Summary page first.");
    return;
  }

  setResult("Getting key insights...");

  const questions = [
    "What is the main contribution?",
    "What methods were used?",
    "What are the key results?",
  ];

  try {
    const response = await fetch("http://127.0.0.1:8000/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper_id, questions }),
    });

    const data = await response.json();
    if (data.status === "processing") {
      setResult("⏳ Paper is still processing. Try again in a few seconds.");
      return;
    }

    let text = "💡 INSIGHTS:\n\n";
    for (const [q, a] of Object.entries(data.insights || {})) {
      text += `• ${q}\n${a}\n\n`;
    }
    setResult(text);
  } catch (error) {
    console.error("Insights error:", error);
    setResult("❌ Failed to get insights.");
  }
}
