const { Octokit } = require("@octokit/rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" }; 
  }

  try {
    const body = JSON.parse(event.body);
    
    // Sometimes Telegram sends edits or other updates, we only care about regular messages
    if (!body.message) return { statusCode: 200, body: "No message object" };
    
    const message = body.message.text;
    const userId = body.message.from.id;

    // Security check: Make sure it's actually you
    if (userId.toString() !== process.env.MY_TELEGRAM_ID) {
      console.log(`Blocked attempt from ID: ${userId}`);
      return { statusCode: 200, body: "Unauthorized" };
    }

    if (!message) return { statusCode: 200, body: "No text provided" };

    // 1. Process the text with Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // Specific instructions to match your previous Eleventy Markdown example
    const prompt = `Act as an SEO expert. Convert these notes into a blog post for Maverick Times.
Return ONLY the raw Markdown content. Do not include markdown code block formatting like \`\`\`markdown.

Use exactly this frontmatter structure:
---
title: [Write a catchy SEO title based on the notes]
description: [Write a 1-sentence SEO description]
date: ${new Date().toISOString().split('T')[0]}
tags:
  - news
layout: layouts/post.njk
image: https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=1000&auto=format&fit=crop
---

Then, write the blog content using H2 and H3 tags. Make it engaging.

Notes to convert: 
${message}`;

    const result = await model.generateContent(prompt);
    let finalMarkdown = result.response.text();

    // Clean up in case Gemini still includes the formatting tags
    finalMarkdown = finalMarkdown.split("```markdown").join("");
    finalMarkdown = finalMarkdown.split("```").join("").trim();

    // 2. Generate a unique filename
    const dateString = new Date().toISOString().split('T')[0];
    const uniqueId = Math.floor(Math.random() * 100000);
    // Assuming your Eleventy posts are in 'src/posts/', adjust if they are in '_posts/' etc.
    const fileName = `src/posts/${dateString}-${uniqueId}.md`;

    // 3. Push to your GitHub Repo
    await octokit.repos.createOrUpdateFileContents({
      owner: "DonPonti", 
      repo: "Maverickwebsite",
      path: fileName,
      message: `Telegram Bot: New Post for ${dateString}`,
      content: Buffer.from(finalMarkdown).toString("base64"),
    });

    console.log(`Successfully published ${fileName} to DonPonti/Maverickwebsite`);
    return { 
      statusCode: 200, 
      body: JSON.stringify({ status: "Success", file: fileName }) 
    };

  } catch (err) {
    console.error("Function Error:", err);
    return { statusCode: 200, body: `Error: ${err.message}` };
  }
};