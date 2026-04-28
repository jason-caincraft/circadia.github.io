# Circadia

Circadia is a GitHub Pages-friendly Jekyll travel journal designed as a calm, single-page reading experience. Posts appear newest first on the homepage, flow vertically like notebook entries, and paginate automatically every 10 posts.

## Create a New Post

1. Duplicate an existing file in `_posts/`.
2. Rename it using the required format: `YYYY-MM-DD-title.md`.
3. Update the Markdown body with your journal entry.
4. Optionally set front matter values:

```yaml
---
title: Morning Ferry
image: /images/ferry.jpg
---
```

The post date is taken from the filename automatically, so you do not need to add a `date:` field in front matter.

## Add Images

1. Place image files in the `images/` directory.
2. Reference them from a post with a site-root path such as `/images/ferry.jpg`.
3. Images will scale responsively, keep their aspect ratio, and display full-width inside each journal entry.

## Deploy with GitHub Pages

1. Push this repository to GitHub.
2. In the repository settings, make sure GitHub Pages is enabled for the default branch.
3. GitHub Pages will build the site with Jekyll automatically.
4. Because pagination is implemented in `index.html` with `jekyll-paginate`, the homepage will generate `/page2/`, `/page3/`, and so on as more entries are added.

## Project Structure

- `_config.yml` contains the Jekyll and pagination settings.
- `index.html` renders the paginated homepage feed.
- `_layouts/` contains the site shell and individual post layout.
- `_includes/post-card.html` renders reusable journal entries on the homepage.
- `_posts/` contains Markdown travel entries named with Jekyll's date-based filename format.
- `images/` stores post photography.
- `assets/styles.css` contains the visual design for the journal.
