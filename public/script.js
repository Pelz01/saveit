// ──────────────────────────────────────────────────────────
// SAVE — Landing Page Interactive Terminal Simulation
// ──────────────────────────────────────────────────────────

const cmdElement = document.getElementById("console-cmd");
const outputElement = document.getElementById("console-output");

const demoScenarios = [
  {
    url: "https://www.youtube.com/watch?v=dQw4w9Q",
    title: "Rick Astley - Never Gonna Give You Up.mp4",
    uploader: "RickAstleyVEVO",
    size: "14.2 MB",
    speed: "4.8 MB/s"
  },
  {
    url: "https://www.tiktok.com/@user/video/719284",
    title: "coding_setup_tour_2026.mp4",
    uploader: "dev_tok",
    size: "28.5 MB",
    speed: "9.2 MB/s"
  },
  {
    url: "https://www.instagram.com/reel/C1A2b3c/",
    title: "kyoto_streets_night_aesthetic.mp4",
    uploader: "travel_japan",
    size: "8.1 MB",
    speed: "5.5 MB/s"
  },
  {
    url: "https://x.com/pelz0x/status/18392810",
    title: "saveit_demo_screencast.mp4",
    uploader: "pelz0x",
    size: "12.4 MB",
    speed: "7.1 MB/s"
  }
];

let scenarioIndex = 0;

// Helper to delay execution
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to write a line of output
function printLine(text, className = "console-text") {
  const line = document.createElement("div");
  line.className = className;
  line.innerHTML = text;
  outputElement.appendChild(line);
  // Auto-scroll terminal if needed
  outputElement.scrollTop = outputElement.scrollHeight;
  return line;
}

// Simulated Typewriter for the Command Line
async function typeCommand(text) {
  cmdElement.textContent = "";
  for (let i = 0; i < text.length; i++) {
    cmdElement.textContent += text[i];
    await wait(Math.floor(Math.random() * 40) + 30);
  }
}

// Generate the visual progress bar string
function getProgressBarString(percent) {
  const barLength = 20;
  const filledLength = Math.round((percent / 100) * barLength);
  const emptyLength = barLength - filledLength;
  return `[${"█".repeat(filledLength)}${"░".repeat(emptyLength)}] ${percent}%`;
}

// Main Simulation Loop
async function runSimulation() {
  while (true) {
    const scenario = demoScenarios[scenarioIndex];
    
    // Clear previous
    cmdElement.textContent = "";
    outputElement.innerHTML = "";
    
    await wait(1200);
    
    // 1. Type the download command
    const fullCommand = `saveit "${scenario.url}"`;
    await typeCommand(fullCommand);
    await wait(800);
    
    // 2. Fetching Video Information
    printLine(`[info] Extracting video metadata from URL...`);
    await wait(1000);
    printLine(`[info] Title: <strong style="color: #fff;">${scenario.title}</strong>`);
    printLine(`[info] Channel: @${scenario.uploader} | File Size: ${scenario.size}`);
    await wait(1000);
    
    // 3. Download Progress Animation
    printLine(`[info] Initializing stream download...`);
    await wait(800);
    
    const progressLine = printLine("", "console-progress");
    
    for (let percent = 0; percent <= 100; percent += Math.floor(Math.random() * 15) + 5) {
      percent = Math.min(percent, 100);
      progressLine.textContent = `${getProgressBarString(percent)}   Speed: ${scenario.speed}`;
      
      if (percent === 100) break;
      await wait(Math.floor(Math.random() * 200) + 150);
    }
    
    await wait(600);
    printLine(`[info] Download sequence complete. Processing stream...`, "console-text--blue");
    await wait(1200);
    
    // 4. Wrapping and Sending
    printLine(`[ok] File sent successfully to Telegram bot chat!`, "console-text--green");
    await wait(5000);
    
    // Next scenario
    scenarioIndex = (scenarioIndex + 1) % demoScenarios.length;
  }
}

// Initialize simulation on load
document.addEventListener("DOMContentLoaded", () => {
  runSimulation();
});
