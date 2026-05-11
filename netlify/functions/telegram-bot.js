const { Octokit } = require("@octokit/rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

exports.handler = async (event) => {
  // Telegram sends data via POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" }; 
  }

  try {
    const body = JSON.parse(event.body);
    const message = body.message?.text;
    const userId = body.message?.from?.id;

    // 1. Security Check
    if (!userId || userId.toString() !== process.env.MY_TELEGRAM_ID) {
      return { statusCode: 200, body: "Unauthorized" };
    }

    if (!message) return { statusCode: 200, body: "No text" };

    // 2. Talk to Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // We keep the prompt simple to avoid syntax issues
    const prompt = "Convert these notes into an Eleventy blog post with frontmatter (title, description, date, tags, layout, image). Return ONLY the markdown code.\n\nNotes: " + message;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    // 3. Clean up Markdown (Safe way without using Regex)
    const cleanMarkdown = rawText
      .split("```markdown").join("")
      .split("
```").join("")
      .trim();

    // 4. File details
    const slug = "post-" + Date.now();
    const fileName = "src/posts/" + slug + ".md";

    // 5. Push to GitHub
    // REPLACE 'your-github-username' and 'maverick-times-repo' with your actual ones!
    await octokit.repos.createOrUpdateFileContents({
      owner: "your-github-username", 
      repo: "your-repo-name",
      path: fileName,
      message: "New post via Telegram",
      content: Buffer.from(cleanMarkdown).toString("base64"),
    });

    return { 
      statusCode: 200, 
      body: JSON.stringify({ status: "success", file: fileName }) 
    };

  } catch (err) {
    console.error("LOG ERROR:", err.message);
    return { statusCode: 200, body: "Error: " + err.message };
  }
};