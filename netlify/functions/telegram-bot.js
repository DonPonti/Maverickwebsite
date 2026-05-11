exports.handler = async (event) => {
  // 1. Dynamic Imports (The Fix for ERR_REQUIRE_ESM)
  const { Octokit } = await import("@octokit/rest");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");

  // Initialize after importing
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" }; 
  }

  try {
    const body = JSON.parse(event.body);
    if (!body.message) return { statusCode: 200, body: "No message" };
    
    const message = body.message.text;
    const userId = body.message.from.id;

    // Security check
    if (userId.toString() !== process.env.MY_TELEGRAM_ID) {
      return { statusCode: 200, body: "Unauthorized" };
    }

    if (!message) return { statusCode: 200, body: "No text" };

    // 2. Gemini Processing
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `Convert these notes into an Eleventy blog post for Maverick Times. 
Return ONLY raw Markdown. 
Frontmatter:
---
title: [SEO Title]
description: [SEO Description]
date: ${new Date().toISOString().split('T')[0]}
tags:
  - news
layout: layouts/post.njk
image: https://images.unsplash.com/photo-1504711434969-e33886168f5c
---
Notes: ${message}`;

    const result = await model.generateContent(prompt);
    let finalMarkdown = result.response.text();

    // Clean markdown tags
    finalMarkdown = finalMarkdown.split("```markdown").join("").split("
```").join("").trim();

    // 3. GitHub Push
    const fileName = `src/posts/post-${Date.now()}.md`;

    await octokit.repos.createOrUpdateFileContents({
      owner: "DonPonti", 
      repo: "Maverickwebsite",
      path: fileName,
      message: "New post via Telegram Bot",
      content: Buffer.from(finalMarkdown).toString("base64"),
    });

    return { 
      statusCode: 200, 
      body: JSON.stringify({ status: "Success", file: fileName }) 
    };

  } catch (err) {
    console.error("LOG ERROR:", err.message);
    return { statusCode: 200, body: "Error: " + err.message };
  }
};