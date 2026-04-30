# CainCraft Circadia - Field Notes and Anecdotes

CainCraft Circadia is a static GitHub Pages-friendly Jekyll field journal for projects, places, repairs, rides, flights, radio checks, photos, and small observations. The site stays fully static: no backend, no database, no CMS, no custom Jekyll plugins, and no JavaScript frameworks.

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

The script:

- creates a dated Markdown file in `_posts/`
- copies the selected image into `images/`
- suggests a category from the title and text unless you override it
- keeps working even if optional metadata is omitted

### EXIF-Assisted Post Creation

The EXIF helper is local only. It runs in `scripts/newpost.js` through Node and never runs during the GitHub Pages build.

Example:

```bash
npm run newpost "Camp dawn" -- --image ./photos/camp-dawn.jpg --text "Cold air and quiet coffee." --use-exif
```

When `--use-exif` is passed:

- the script tries to read the image's capture date and uses that date in the post filename
- the script tries to read GPS coordinates and adds them to front matter when found
- if EXIF data is incomplete or missing, the script continues gracefully and falls back to today's date
- if you already pass `--coordinates-lat` and `--coordinates-lng`, those manual values win

EXIF fields that may be detected:

- original capture date, create date, or similar EXIF timestamp fields
- GPS latitude and longitude when the image contains them

If the `exifr` dependency is not installed yet, `--use-exif` warns and continues without failing the rest of the post creation flow.

## Post Helper Options

Optional flags for `npm run newpost`:

- `--layout post|build`
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
image: /images/example.jpg
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

Everything except `title` is optional. Existing posts without coordinates, conditions, gear, tags, or mode still render normally.

When `location` is provided through the post helper, it is also added to `tags` automatically unless that same tag is already present.

The post date comes from the filename. If you want a post to land on a different day, change the `YYYY-MM-DD` portion of the filename or use `--use-exif` with an image that contains a capture date.

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

## Images, Locations, and Map Coordinates

- Store post images in `images/`.
- Reference them from front matter with a site-root path such as `/images/camp.jpg`.
- Add `alt` text when possible so the image is described for screen readers.
- Add `location` when a note should show where it happened. The helper also adds that location text to `tags` for easier filtering and search.
- Add both `coordinates.lat` and `coordinates.lng` when a post should appear on `/map/`.

Posts without coordinates are ignored on the map page. Posts without images, locations, or conditions still render cleanly.

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
- The deployed site remains static and maintainable.

## Project Structure

- `_config.yml` holds the site identity and Jekyll pagination settings.
- `index.html` renders the homepage hero, the `On This Day` section, and the paginated feed.
- `search.html` provides the client-side search page at `/search/`.
- `search.json` generates the static search index with Liquid.
- `map.html` builds the optional field map page at `/map/`.
- `archive.html` builds the archive page at `/archive/`.
- `category/index.html` builds the category directory page at `/category/`.
- `category/*.html` builds one static page per category such as `/category/camping/`.
- `_layouts/default.html` provides the shared page shell and navigation.
- `_layouts/post.html` renders standard field note pages.
- `_layouts/build.html` renders project and workbench style entries.
- `_includes/post-card.html` renders homepage post cards.
- `_posts/` stores Markdown entries named with date-based filenames.
- `images/` stores post images.
- `assets/styles.css` contains the field notebook and workbench theme.
- `scripts/newpost.js` handles local post generation and optional EXIF extraction.
