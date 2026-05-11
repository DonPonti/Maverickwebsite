const { Octokit } = require("@octokit/rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const body = JSON.parse(event.body);
    const message = body.message?.text;
    const user = body.message?.from.id;

    // SECURITY: Only YOU can use this bot. 
    // Replace YOUR_TELEGRAM_ID with your actual ID (get it from @userinfobot)
    if (user.toString() !== process.env.MY_TELEGRAM_ID) {
      return { statusCode: 200, body: "Unauthorized" };
    }

    if (!message) return { statusCode: 200 };

    // 1. Ask Gemini to format the blog
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `Convert the following notes into an Eleventy blog post. 
    Output ONLY the raw Markdown. Use this exact frontmatter:
    ---
    title: [SEO Title]
    description: [Brief SEO Description]
    date: ${new Date().toISOString().split('T')[0]}
    tags:
      - news
    layout: layouts/post.njk
    image: https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=1000&auto=format&fit=crop
    ---
    [Content with H2/H3 headers]

    Notes: ${message}`;

    const result = await model.generateContent(prompt);
    const blogMarkdown = result.response.text().replace(/```markdown|
```/g, ""); // Clean formatting tags

    // 2. Prepare the Filename
    const slug = "post-" + Date.now();
    const filePath = `src/posts/${slug}.md`;

    // 3. Commit to GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner: "YOUR_GITHUB_USERNAME", // Change this
      repo: "YOUR_REPO_NAME",           // Change this
      path: filePath,
      message: `New post from Telegram: ${slug}`,
      content: Buffer.from(blogMarkdown).toString('base64'),
    });

    return { statusCode: 200, body: "Success! Post pushed to GitHub." };
  } catch (err) {
    console.error(err);
    return { statusCode: 200, body: "Error occurred" }; // Telegram expects a 200 even on error to stop retrying
  }
};