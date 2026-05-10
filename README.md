# CainCraft Circadia - Field Notes and Anecdotes

CainCraft Circadia is a GitHub Pages-friendly Jekyll field journal for projects, places, repairs, rides, flights, radio checks, photos, and small observations. The public site stays static: no database, no custom Jekyll plugins, and no JavaScript framework in the published experience. Authoring can happen either locally with Node helper scripts or in the browser through `/admin/`, which commits back to GitHub through a separate OAuth proxy deployment.

## Deployment Model

- The public site is meant to publish as a static Jekyll site.
- The Cloudflare Worker is only for the `/admin/` GitHub OAuth popup flow.
- Do not point a repo-root Cloudflare Worker Build at this project for the public site. That is what caused the failing `npx wrangler versions upload` build.
- If you keep a Cloudflare build connected to this repository, retarget it to the OAuth Worker only by using the `oauth-proxy/` config and one of the scripts below.

Worker-only commands:

```bash
npm run oauth:dev
npm run oauth:deploy
npm run oauth:preview
```

If you ever move the public site itself off GitHub Pages and onto Cloudflare, replace the repo-root Worker deploy with a static-site build flow instead of uploading the repository root as a Worker.

## Discovery Features

### Search

- `/search/` is a plain JavaScript client-side search page.
- The page loads `/search.json`, which Jekyll generates with Liquid during the normal site build.
- `search.json` includes each post's title, URL, date, category, tags, location, excerpt, and searchable text content.
- Search runs entirely in the browser and checks title, category, tags, location, and note text.

### On This Day

- The homepage includes a small `On This Day` section.
- It reads the same static `search.json` index in the browser.
- The script compares the visitor's current month and day to post dates and shows matching posts from earlier years.
- If there are no matches yet, the section shows a quiet empty state.

### Archive Timeline

- `/archive/` keeps the site static and now groups entries into clearer year sections with compact month timelines.
- The archive layout stays readable on mobile and still works with older posts that only have basic front matter.

## Local Authoring Workflow

Install local Node dependencies once:

```bash
npm install
```

Create a new post with the helper script:

```bash
npm run newpost "Post title" -- --image ./path/to/photo.jpg --text "Short note text"
```

Create a multi-photo post with:

```bash
npm run newpost "Post title" -- --images "./path/to/photo-a.jpg|./path/to/photo-b.jpg" --text "Short note text"
```

Create a photo essay post with:

```bash
npm run newpost "Post title" -- --images "./path/to/photo-a.jpg|./path/to/photo-b.jpg|./path/to/photo-c.jpg" --image-layout essay --text "First paragraph.

Second paragraph.

Third paragraph."
```

Create a video post with:

```bash
npm run newpost "Post title" -- --video ./path/to/clip.mp4 --location "Trail name" --text "Short note text"
```

The script:

- creates a dated Markdown file in `_posts/`
- copies the selected image or images into `images/`
- copies the selected video into `videos/` when `--video` is used
- suggests a category from the title and text unless you override it
- keeps working even if optional metadata is omitted
- writes an explicit front matter `date:` so the post timestamp and filename stay aligned
- writes `image` as the featured image path and adds `images` when multiple photos are selected
- writes `image_layout: essay` when you opt into photo-essay rendering
- only writes `coordinates` when you provide them manually or EXIF GPS data is extracted from the oldest selected image

## Browser Authoring Workflow

- `/admin/` loads Decap CMS for owner-only browser editing.
- The CMS writes Markdown posts into `_posts/`, uploads selected images into `images/`, and uploads selected videos into `videos/`.
- The CMS logs in through GitHub OAuth using a separately deployed proxy service.
- Browser-created posts use the same front matter fields as the existing Jekyll layouts, search index, archive pages, category pages, and map page.
- Before save, the browser editor uses the oldest selected photo as the featured `image` and EXIF source for `date` and GPS coordinates.
- Manual coordinates still win when both latitude and longitude are already present.

### CMS Files

- `admin/index.html` is the browser editor shell.
- `admin/config.yml` defines the GitHub-backed post collection and image upload behavior.
- `oauth-proxy/` contains the Cloudflare Worker used for the GitHub OAuth popup flow.
- EXIF extraction in `/admin/` runs in the browser with `exifr`; it picks the oldest selected photo to fill the featured image, publish date, and map coordinates when available.

### One-Time OAuth Setup

1. Create a GitHub OAuth app for this site.
2. Deploy the Worker in `oauth-proxy/` to a subdomain such as `https://auth.caincraft.com`.
3. Set the Worker secrets for `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. Keep `admin/config.yml` pointed at the deployed auth domain through `backend.base_url`.

Recommended OAuth app values:

- Homepage URL: `https://caincraft.com/admin/`
- Authorization callback URL: `https://auth.caincraft.com/callback`

For deployment details, see `oauth-proxy/README.md`.

### EXIF-Assisted Post Creation

The EXIF helper is local only. It runs in `scripts/newpost.js` through Node and never runs during the GitHub Pages build.

The VS Code `New Circadia Post` task now enables EXIF automatically for the selected image set. A separate `New Circadia Video Post` task creates video-first entries without EXIF. Direct CLI use can still opt in with `--use-exif`.

Example:

```bash
npm run newpost "Camp dawn" -- --images "./photos/camp-dawn.jpg|./photos/camp-kitchen.jpg" --text "Cold air and quiet coffee." --use-exif
```

When `--use-exif` is passed:

- the script tries to read every selected image's capture date and picks the oldest photo as the featured `image`
- the script uses that oldest photo's timestamp for the front matter `date:` field and the copied file name prefix
- the script tries to read GPS coordinates from that same oldest photo and uses them for front matter when found
- if GPS data is missing, unavailable, or no image is provided, the script leaves coordinates unset unless you pass manual coordinates
- if EXIF date data is incomplete or missing across the selected images, the script continues gracefully, falls back to the current local date and time, and keeps the first selected image as featured
- if you already pass `--coordinates-lat` and `--coordinates-lng`, those manual values win

EXIF fields that may be detected:

- original capture date, create date, or similar EXIF timestamp fields
- GPS latitude and longitude when the image contains them

If the `exifr` dependency is not installed yet, `--use-exif` warns and continues without failing the rest of the post creation flow.

## Post Helper Options

Optional flags for `npm run newpost`:

- `--image ./path/to/photo.jpg`
- `--images "./path/to/photo-a.jpg|./path/to/photo-b.jpg"`
- `--layout post|build`
- `--image-layout essay`
- `--video ./path/to/video.mp4`
- `--category auto|gardening|rc-crawling|fpv|photography|amateur-radio|motorcycling|camping|marksmanship`
- `--tags "tag one, tag two"`
- `--mode build|explore|test|maintain|observe`
- `--location "Backyard"`
- `--coordinates-lat 43.615`
- `--coordinates-lng -116.202`
- `--weather "Clear"`
- `--temperature "58 F"`
- `--light "Late afternoon"`
- `--gear "Axial SCX6 Jeep | Canon camera"`
- `--project "Axial SCX6 Jeep"`
- `--stage "Suspension tuning"`
- `--parts "Softer rear springs | Wheel weights"`
- `--changes "Adjusted preload | Moved battery forward"`
- `--lessons "Better climbing balance"`
- `--alt "Optional image description"`
- `--use-exif`

## Front Matter Reference

Use this front matter shape for a standard post:

```yaml
---
title: "Post Title"
date: 2026-04-30 07:18:00 -0600
video: /videos/example.mp4
image: /images/example.jpg
images:
  - "/images/example.jpg"
  - "/images/example-02.jpg"
image_layout: essay
category: rc-crawling
tags: [backyard, testing, suspension]
mode: test
location: "Optional Location"
coordinates:
  lat: 43.615
  lng: -116.202
conditions:
  weather: "Clear"
  temperature: "58 F"
  light: "Late afternoon"
gear:
  - "Axial SCX6 Jeep"
  - "Canon camera"
alt: "Optional image description"
---
```

Everything except `title` is optional. The helper now writes `date:` automatically for new posts. Existing posts without coordinates, conditions, gear, tags, mode, video, image, or `images` still render normally.

For a minimal video post, this is enough:

```yaml
---
title: "Creek Crossing Clip"
date: 2026-05-02 18:40:00 -0600
video: /videos/2026-05-02-creek-crossing-clip.mp4
location: "Thorne Creek"
---
```

When `location` is provided through the post helper, it is also added to `tags` automatically unless that same tag is already present.

For new helper-generated posts, the filename day and front matter `date:` are kept in sync. If you want a post to land on a different day, change the `YYYY-MM-DD` portion of the filename and the `date:` value together, or use `--use-exif` with an image that contains a capture date.

## Categories

Use one of these `category` values:

- `gardening`
- `rc-crawling`
- `fpv`
- `photography`
- `amateur-radio`
- `motorcycling`
- `camping`
- `marksmanship`

If `category` is omitted, the site displays the post as `Field Note`.

## Modes

Use one of these `mode` values when a post should show a work-state indicator:

- `build`
- `explore`
- `test`
- `maintain`
- `observe`

If `mode` is omitted, nothing is shown.

## Images, Videos, Locations, and Map Coordinates

- Store post images in `images/`.
- Store post videos in `videos/`.
- Reference them from front matter with a site-root path such as `/images/camp.jpg`.
- Use `image` for the featured hero or card image.
- Use `images` for ordered multi-photo sequences when a post has more than one image.
- Use `image_layout: essay` on a standard `layout: post` entry when the remaining images should be interleaved through the story instead of collected into a gallery.
- Reference videos from front matter with a site-root path such as `/videos/camp-fire.mp4`.
- Add `alt` text when possible so the image is described for screen readers.
- Add `location` when a note should show where it happened. The helper also adds that location text to `tags` for easier filtering and search.
- Add both `coordinates.lat` and `coordinates.lng` when a post should appear on `/map/`.

Posts without coordinates are ignored on the map page. Posts without images, videos, locations, or conditions still render cleanly. Multi-photo posts render the featured image first, then either an end-of-post gallery or a photo essay interleave depending on `image_layout`. The v1 essay mode inserts one remaining image after each paragraph in order, then appends any leftovers below the body without captions.

## Build Log Posts

Use `layout: build` for project notes that should feel more like a workbench log than a general field note.

Build posts support these optional fields:

- `project`
- `stage`
- `parts`
- `changes`
- `lessons`
- `conditions`
- `gear`
- `coordinates`

See `_posts/2026-04-30-scx6-backyard-suspension-test.md` for a complete working example.

## GitHub Pages Compatibility

- The site uses standard Jekyll templates and `jekyll-paginate`.
- Search works from a generated static JSON file and browser-side JavaScript.
- On This Day also uses browser-side JavaScript against the generated static JSON file.
- EXIF processing is local only in Node and does not run on GitHub Pages.
- Browser authoring reads EXIF metadata client-side inside `/admin/` and uses the oldest selected photo to fill the featured image, publish date, and coordinates before save when available.
- `/admin/` is a static route, while authentication is delegated to the separate OAuth proxy deployment.
- The deployed public site remains static and maintainable.

## Project Structure

- `_config.yml` holds the site identity and Jekyll pagination settings.
- `index.html` renders the homepage hero, the `On This Day` section, and the paginated feed.
- `search.html` provides the client-side search page at `/search/`.
- `search.json` generates the static search index with Liquid.
- `map.html` builds the optional field map page at `/map/`.
- `archive.html` builds the archive page at `/archive/`.
- `category/index.html` builds the category directory page at `/category/`.
- `category/*.html` builds one static page per category such as `/category/camping/`.
- `admin/index.html` loads the browser-based post editor at `/admin/`.
- `admin/config.yml` defines the browser editor schema and GitHub backend settings.
- `_layouts/default.html` provides the shared page shell and navigation.
- `_layouts/post.html` renders standard field note pages.
- `_layouts/build.html` renders project and workbench style entries.
- `_includes/post-card.html` renders homepage post cards.
- `_posts/` stores Markdown entries named with date-based filenames.
- `images/` stores post images.
- `videos/` stores post videos.
- `assets/styles.css` contains the field notebook and workbench theme.
- `scripts/newpost.js` handles local post generation, multi-photo copying, and optional EXIF extraction.
- `oauth-proxy/` contains the separate GitHub OAuth Worker for browser login.
