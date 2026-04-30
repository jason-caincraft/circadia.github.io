# CainCraft Circadia - Field Notes and Anecdotes

CainCraft Circadia is a GitHub Pages-friendly Jekyll field journal for projects, places, repairs, rides, flights, radio checks, and small observations. Posts stay newest first on the homepage and paginate automatically every 10 entries.

## Create a New Post

1. Duplicate an existing Markdown file in `_posts/`.
2. Rename it using Jekyll's required filename format: `YYYY-MM-DD-title.md`.
3. Update the front matter and body text for the new entry.

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

Everything except `title` is optional. Existing posts without coordinates, conditions, gear, or mode still render normally.

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

If `category` is omitted, the site will display the post as `Field Note`.

## Tags

Add a `tags` array when you want small non-clickable pills to appear on post cards and individual post pages:

```yaml
tags: [backyard, tuning, suspension]
```

Tags are display-only. There are no tag archive pages yet.

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

## Add Coordinates for the Map

Add a `coordinates` object when you want a post to appear on the map page:

```yaml
coordinates:
  lat: 43.615
  lng: -116.202
```

- `lat` and `lng` must both be present for the marker to appear.
- Posts without coordinates are ignored on the map page.
- The map page lives at `/map/` and is linked in the top navigation.

The marker popup shows:

- post title
- date
- category
- location
- link to the full post

If no posts contain coordinates, `/map/` shows a helpful empty-state message instead of an empty map.

## Add Conditions

Add a `conditions` object when you want the site to show a compact field log on the homepage card and the individual post page:

```yaml
conditions:
  weather: "Clear"
  temperature: "58 F"
  light: "Late afternoon"
```

You can include any subset of the fields above. Missing values are skipped automatically.

## Add Gear

Add a `gear` list when you want a `Gear Used` section on the post page:

```yaml
gear:
  - "Axial SCX6 Jeep"
  - "Canon camera"
  - "2 mm hex driver"
```

- Individual post pages show the full list.
- Homepage cards show a shortened version when gear is present.

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

Example front matter:

```yaml
---
layout: build
title: "SCX6 backyard suspension test"
image: /images/2026-04-29-backyard-rc-crawling.jpg
category: rc-crawling
tags: [backyard, suspension, tuning]
mode: build
project: "Axial SCX6 Jeep"
stage: "Suspension tuning"
location: "Backyard rock pile"
coordinates:
  lat: 43.615
  lng: -116.202
conditions:
  weather: "Clear"
  temperature: "58 F"
  light: "Late afternoon"
gear:
  - "Axial SCX6 Jeep"
  - "Wheel hex weights"
parts:
  - "Softer rear springs"
  - "Wheel weights"
changes:
  - "Adjusted preload"
  - "Moved battery slightly forward"
lessons:
  - "Better climbing balance"
alt: "SCX6 crawler on a backyard rock line during suspension testing"
---
```

The build layout renders:

- project name
- stage
- date
- image
- main post content
- parts list
- changes made
- lessons learned

See `_posts/2026-04-30-scx6-backyard-suspension-test.md` for a complete working example.

## GitHub Pages Deployment

1. Push changes to the repository's published branch.
2. GitHub Pages builds the site with Jekyll automatically.
3. The homepage uses `jekyll-paginate`, so the front page stays at 10 posts per page and generates older pages such as `/page2/`, `/page3/`, and so on.
4. The map page stays static and only loads Leaflet when at least one post includes coordinates.
5. Because the site is fully static, there is no CMS, login system, backend service, or database to maintain.

## Project Structure

- `_config.yml` holds the site identity and Jekyll pagination settings.
- `index.html` renders the homepage hero and paginated feed.
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
- `assets/styles.css` contains the field notebook / workbench theme.
