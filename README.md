# CainCraft Circadia - Field Notes and Anecdotes

CainCraft Circadia is a GitHub Pages-friendly Jekyll field journal for projects, places, repairs, rides, flights, radio checks, and small observations. Posts stay newest first on the homepage and paginate automatically every 10 entries.

## Create a New Post

1. Duplicate an existing Markdown file in `_posts/`.
2. Rename it using Jekyll's required filename format: `YYYY-MM-DD-title.md`.
3. Update the front matter and body text for the new entry.

Use this front matter shape:

```yaml
---
title: "Post Title"
image: /images/example.jpg
category: rc-crawling
tags: [backyard, testing, suspension]
mode: test
location: "Optional Location"
alt: "Optional image description"
---
```

The post date comes from the filename, not from front matter. If you want a post to show a different day, change the `YYYY-MM-DD` portion of the filename.

## Valid Categories

Use one of these `category` values:

- `gardening`
- `rc-crawling`
- `fpv`
- `photography`
- `amateur-radio`
- `motorcycling`
- `camping`
- `marksmanship`

If `category` is omitted, the site will display the post as `🧭 Field Note`.

## Tags

Add a `tags` array when you want small non-clickable pills to appear on post cards and individual post pages:

```yaml
tags: [backyard, tuning, suspension]
```

Tags are display-only in Phase 1. There are no tag archive pages yet.

## Modes

Add `mode` when a post should show a work-state indicator:

```yaml
mode: test
```

Use one of these `mode` values:

- `build`
- `explore`
- `test`
- `maintain`
- `observe`

These render as:

- `build` -> `🔧 Build`
- `explore` -> `🧭 Explore`
- `test` -> `🧪 Test`
- `maintain` -> `🔁 Maintain`
- `observe` -> `👀 Observe`

If `mode` is omitted, nothing is shown.

## Add Images

1. Place image files in the `images/` directory.
2. Reference the file from front matter with a site-root path such as `/images/camp.jpg`.
3. Add `alt` text when you can so the image is described for screen readers.

If `alt` is omitted, the templates fall back to the post title and then to a neutral default description.

## Optional Location Field

Add `location` when a note should show where it happened:

```yaml
location: "Somewhere off the main road"
```

Leave it out when the place is not important to the entry.

## GitHub Pages Deployment

1. Push changes to the repository's published branch.
2. GitHub Pages builds the site with Jekyll automatically.
3. The homepage uses `jekyll-paginate`, so the front page stays at 10 posts per page and generates older pages such as `/page2/`, `/page3/`, and so on.
4. Because the site is fully static, there is no CMS, login system, or backend service to maintain.

## Project Structure

- `_config.yml` holds the site identity and Jekyll pagination settings.
- `index.html` renders the homepage hero and paginated feed.
- `archive.html` builds the archive page at `/archive/`.
- `category/index.html` builds the category directory page at `/category/`.
- `category/*.html` builds one static page per category such as `/category/camping/`.
- `_layouts/default.html` provides the shared page shell.
- `_layouts/post.html` renders individual field note pages.
- `_includes/post-card.html` renders homepage post cards.
- `_posts/` stores Markdown entries named with date-based filenames.
- `images/` stores post images.
- `assets/styles.css` contains the field notebook / workbench theme.
