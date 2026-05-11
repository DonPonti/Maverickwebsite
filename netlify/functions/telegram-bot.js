import { Octokit } from "@octokit/rest";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const handler = async (event) => {
  // Only allow POST requests (Telegram sends POST)
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const message = body.message?.text;
    const userId = body.message?.from?.id;

    // 1. Security: Only you can post
    if (!userId || userId.toString() !== process.env.MY_TELEGRAM_ID) {
      console.log("Unauthorized user ID:", userId);
      return { statusCode: 200, body: "Unauthorized" };
    }

    if (!message) return { statusCode: 200, body: "No message found" };

    // 2. Ask Gemini to format the blog
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // We use a clean template literal here to avoid any stray slashes
    const systemPrompt = `Create an Eleventy blog post. 
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

Notes to convert: ${message}`;

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();

    // 3. Clean Markdown (Safer than using a regex literal)
    const blogMarkdown = responseText
      .split("```markdown").join("")
      .split("```").join("")
      .trim();

    // 4. Generate Filename
    const slug = `post-${Date.now()}`;
    const filePath = `src/posts/${slug}.md`;

    // 5. Push to GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner: "YOUR_GITHUB_USERNAME", // <-- DOUBLE CHECK THIS
      repo: "maverick-times-repo",     // <-- DOUBLE CHECK THIS
      path: filePath,
      message: `Telegram Blog: ${slug}`,
      content: Buffer.from(blogMarkdown).toString('base64'),
    });

    console.log(`Successfully created: ${filePath}`);
    return { statusCode: 200, body: "Post Published Successfully!" };

  } catch (err) {
    console.error("Function Error:", err);
    // We return 200 so Telegram stops retrying the failing request
    return { statusCode: 200, body: "Error: " + err.message };
  }
};