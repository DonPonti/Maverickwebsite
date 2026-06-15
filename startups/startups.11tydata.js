module.exports = () => {
  return {
    // Explicitly enforce the layout and tags for everything inside /startups/
    layout: "layouts/profile.njk",
    tags: ["startup-profile"],
    
    // Ensure Eleventy never accidentally hides these from your collections
    eleventyComputed: {
      eleventyExcludeFromCollections: false,
      permalink: (data) => data.permalink || `/startups/${data.page.fileSlug}/`
    }
  };
};