const fs = require("fs");
const path = require("path");

let exifr = null;

try {
  exifr = require("exifr");
} catch (error) {
  exifr = null;
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(`
Usage:
npm run newpost "Post title" -- --image ./path/to/photo.jpg --text "Short note text"

Optional metadata:
  --layout post|build
  --category auto|gardening|rc-crawling|fpv|photography|amateur-radio|motorcycling|camping|marksmanship
  --tags "tag one, tag two"
  --mode build|explore|test|maintain|observe
  --location "Backyard"
  --coordinates-lat 43.615
  --coordinates-lng -116.202
  --weather "Clear"
  --temperature "58 F"
  --light "Late afternoon"
  --gear "Axial SCX6 Jeep | Canon camera"
  --project "Axial SCX6 Jeep"
  --stage "Suspension tuning"
  --parts "Softer rear springs | Wheel weights"
  --changes "Adjusted preload | Moved battery forward"
  --lessons "Better climbing balance"
  --alt "Optional image description"
  --use-exif

Examples:
npm run newpost "First spring garden check" -- --image ./photos/garden.jpg --text "Checked the lettuce and onions after the rain."
npm run newpost "SCX6 backyard suspension test" -- --layout build --mode build --project "Axial SCX6 Jeep" --stage "Suspension tuning" --parts "Softer rear springs | Wheel weights"
npm run newpost "Camp dawn" -- --image ./photos/camp-dawn.jpg --text "Cold air and quiet coffee." --use-exif
`);
  process.exit(1);
}

const FLAG_NAMES = new Set([
  "--image",
  "--text",
  "--layout",
  "--category",
  "--tags",
  "--mode",
  "--location",
  "--coordinates-lat",
  "--coordinates-lng",
  "--weather",
  "--temperature",
  "--light",
  "--gear",
  "--project",
  "--stage",
  "--parts",
  "--changes",
  "--lessons",
  "--alt",
  "--use-exif"
]);

const VALID_LAYOUTS = new Set(["post", "build"]);
const VALID_CATEGORIES = new Set([
  "gardening",
  "rc-crawling",
  "fpv",
  "photography",
  "amateur-radio",
  "motorcycling",
  "camping",
  "marksmanship"
]);
const VALID_MODES = new Set(["build", "explore", "test", "maintain", "observe"]);
const FALLBACK_COORDINATES = {
  lat: 43.618611,
  lng: -116.425167
};

const titleParts = [];
const options = {
  image: "",
  text: "",
  layout: "post",
  category: "auto",
  tags: "",
  mode: "",
  location: "",
  coordinatesLat: "",
  coordinatesLng: "",
  weather: "",
  temperature: "",
  light: "",
  gear: "",
  project: "",
  stage: "",
  parts: "",
  changes: "",
  lessons: "",
  alt: "",
  useExif: false
};

function readFlagValue(index) {
  const value = args[index + 1];
  if (typeof value === "undefined") {
    console.error(`Missing value for ${args[index]}.`);
    process.exit(1);
  }
  return value;
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "--") {
    continue;
  } else if (arg === "--image") {
    options.image = readFlagValue(i);
    i++;
  } else if (arg === "--text") {
    options.text = readFlagValue(i);
    i++;
  } else if (arg === "--layout") {
    options.layout = readFlagValue(i);
    i++;
  } else if (arg === "--category") {
    options.category = readFlagValue(i);
    i++;
  } else if (arg === "--tags") {
    options.tags = readFlagValue(i);
    i++;
  } else if (arg === "--mode") {
    options.mode = readFlagValue(i);
    i++;
  } else if (arg === "--location") {
    options.location = readFlagValue(i);
    i++;
  } else if (arg === "--coordinates-lat") {
    options.coordinatesLat = readFlagValue(i);
    i++;
  } else if (arg === "--coordinates-lng") {
    options.coordinatesLng = readFlagValue(i);
    i++;
  } else if (arg === "--weather") {
    options.weather = readFlagValue(i);
    i++;
  } else if (arg === "--temperature") {
    options.temperature = readFlagValue(i);
    i++;
  } else if (arg === "--light") {
    options.light = readFlagValue(i);
    i++;
  } else if (arg === "--gear") {
    options.gear = readFlagValue(i);
    i++;
  } else if (arg === "--project") {
    options.project = readFlagValue(i);
    i++;
  } else if (arg === "--stage") {
    options.stage = readFlagValue(i);
    i++;
  } else if (arg === "--parts") {
    options.parts = readFlagValue(i);
    i++;
  } else if (arg === "--changes") {
    options.changes = readFlagValue(i);
    i++;
  } else if (arg === "--lessons") {
    options.lessons = readFlagValue(i);
    i++;
  } else if (arg === "--alt") {
    options.alt = readFlagValue(i);
    i++;
  } else if (arg === "--use-exif") {
    options.useExif = true;
  } else if (arg.startsWith("--") && FLAG_NAMES.has(arg) === false) {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  } else {
    titleParts.push(arg);
  }
}

const title = titleParts.join(" ").trim();

if (!title) {
  console.error("Missing post title.");
  process.exit(1);
}

function normalizeValue(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function suggestCategory(text) {
  const t = text.toLowerCase();

  const categories = [
    { key: "gardening", words: ["garden", "seed", "plant", "lettuce", "tomato", "pepper", "soil", "bed", "harvest", "watering"] },
    { key: "rc-crawling", words: ["crawler", "scx24", "scx6", "trail rig", "rocks", "moab", "course", "rc crawl"] },
    { key: "fpv", words: ["fpv", "aircraft", "plane", "wing", "drone", "quad", "flight", "airfield", "battery", "goggles"] },
    { key: "photography", words: ["photo", "camera", "lens", "shot", "sunset", "portrait", "lightroom", "photography"] },
    { key: "amateur-radio", words: ["radio", "ham", "antenna", "hf", "vhf", "uhf", "qso", "contact", "repeater"] },
    { key: "motorcycling", words: ["motorcycle", "bike", "ride", "road", "helmet", "garage", "oil", "chain"] },
    { key: "camping", words: ["camp", "tent", "trail", "fire", "sleeping bag", "backcountry", "campsite"] },
    { key: "marksmanship", words: ["range", "marksmanship", "target", "zero", "groups", "practice"] }
  ];

  let best = { key: "photography", score: 0 };

  for (const category of categories) {
    const score = category.words.reduce((sum, word) => sum + (t.includes(word) ? 1 : 0), 0);
    if (score > best.score) {
      best = { key: category.key, score };
    }
  }

  return best.key;
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseList(value, separators) {
  return String(value || "")
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isFiniteCoordinate(value) {
  if (value === "") {
    return false;
  }

  const number = Number(value);
  return Number.isFinite(number);
}

function appendListBlock(lines, key, values) {
  if (values.length === 0) {
    return;
  }

  lines.push(`${key}:`);
  for (const value of values) {
    lines.push(`  - ${yamlString(value)}`);
  }
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatDateForFilename(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatDateForFrontMatter(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = padNumber(Math.floor(absoluteOffset / 60));
  const offsetRemainderMinutes = padNumber(absoluteOffset % 60);

  return [
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`,
    `${sign}${offsetHours}${offsetRemainderMinutes}`
  ].join(" ");
}

function pickExifDate(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidates = [
    metadata.DateTimeOriginal,
    metadata.CreateDate,
    metadata.ModifyDate,
    metadata.DateTimeDigitized
  ];

  for (const candidate of candidates) {
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return candidate;
    }

    if (typeof candidate === "string" || typeof candidate === "number") {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function pickExifCoordinates(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const latitudeCandidates = [metadata.latitude, metadata.lat, metadata.GPSLatitude];
  const longitudeCandidates = [metadata.longitude, metadata.lon, metadata.lng, metadata.GPSLongitude];

  for (const latitude of latitudeCandidates) {
    for (const longitude of longitudeCandidates) {
      if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
        return {
          lat: Number(latitude),
          lng: Number(longitude)
        };
      }
    }
  }

  return null;
}

async function readExifMeta(imagePath) {
  const meta = {
    captureDate: null,
    fileDate: "",
    coordinates: null,
    warnings: []
  };

  if (!imagePath) {
    meta.warnings.push("EXIF lookup skipped because no image path was provided.");
    return meta;
  }

  if (!exifr) {
    meta.warnings.push("EXIF support is not installed yet. Run npm install to enable --use-exif.");
    return meta;
  }

  try {
    const metadata = await exifr.parse(imagePath);
    const exifDate = pickExifDate(metadata);
    const coordinates = pickExifCoordinates(metadata);

    if (exifDate) {
      meta.captureDate = exifDate;
      meta.fileDate = formatDateForFilename(exifDate);
    }

    if (coordinates) {
      meta.coordinates = coordinates;
    }

    if (!meta.captureDate) {
      meta.warnings.push("No EXIF capture date was found. Using the current local date and time instead.");
    }

    if (!meta.coordinates) {
      meta.warnings.push("No EXIF GPS coordinates were found.");
    }
  } catch (error) {
    meta.warnings.push(`EXIF lookup failed: ${error.message}`);
  }

  return meta;
}

async function main() {
  const normalizedLayout = normalizeValue(options.layout || "post").toLowerCase() || "post";
  if (!VALID_LAYOUTS.has(normalizedLayout)) {
    console.error(`Invalid layout: ${options.layout}. Use "post" or "build".`);
    process.exit(1);
  }

  const normalizedMode = normalizeValue(options.mode).toLowerCase();
  if (normalizedMode && !VALID_MODES.has(normalizedMode)) {
    console.error(`Invalid mode: ${options.mode}.`);
    process.exit(1);
  }

  const requestedCategory = normalizeValue(options.category).toLowerCase();
  let category = suggestCategory(`${title} ${options.text}`);
  if (requestedCategory && requestedCategory !== "auto") {
    if (!VALID_CATEGORIES.has(requestedCategory)) {
      console.error(`Invalid category: ${options.category}.`);
      process.exit(1);
    }
    category = requestedCategory;
  }

  let coordinatesLat = normalizeValue(options.coordinatesLat);
  let coordinatesLng = normalizeValue(options.coordinatesLng);

  if ((coordinatesLat && !coordinatesLng) || (!coordinatesLat && coordinatesLng)) {
    console.error("Coordinates require both --coordinates-lat and --coordinates-lng.");
    process.exit(1);
  }
  if (coordinatesLat && !isFiniteCoordinate(coordinatesLat)) {
    console.error(`Invalid latitude: ${coordinatesLat}`);
    process.exit(1);
  }
  if (coordinatesLng && !isFiniteCoordinate(coordinatesLng)) {
    console.error(`Invalid longitude: ${coordinatesLng}`);
    process.exit(1);
  }

  const tags = parseList(options.tags, /,/);
  const location = normalizeValue(options.location);
  if (location && !tags.some((tag) => tag.toLowerCase() === location.toLowerCase())) {
    tags.push(location);
  }
  const gear = parseList(options.gear, /\|/);
  const parts = parseList(options.parts, /\|/);
  const changes = parseList(options.changes, /\|/);
  const lessons = parseList(options.lessons, /\|/);

  const postsDir = path.join(process.cwd(), "_posts");
  const imagesDir = path.join(process.cwd(), "images");
  const slug = slugify(title);
  const imagePath = normalizeValue(options.image);
  const defaultTimestamp = new Date();
  const defaultDate = formatDateForFilename(defaultTimestamp);

  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir);
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
  }

  let resolvedImagePath = "";
  if (imagePath) {
    resolvedImagePath = path.resolve(process.cwd(), imagePath);

    if (!fs.existsSync(resolvedImagePath)) {
      console.error(`Image not found: ${imagePath}`);
      process.exit(1);
    }
  }

  let postDate = defaultDate;
  let postTimestamp = defaultTimestamp;
  let exifMeta = {
    captureDate: null,
    fileDate: "",
    coordinates: null,
    warnings: []
  };

  if (options.useExif) {
    exifMeta = await readExifMeta(resolvedImagePath);

    if (exifMeta.captureDate) {
      postTimestamp = exifMeta.captureDate;
      postDate = exifMeta.fileDate;
    }

    if (!coordinatesLat && !coordinatesLng && exifMeta.coordinates) {
      coordinatesLat = String(exifMeta.coordinates.lat);
      coordinatesLng = String(exifMeta.coordinates.lng);
    }
  }

  if (!coordinatesLat && !coordinatesLng) {
    coordinatesLat = String(FALLBACK_COORDINATES.lat);
    coordinatesLng = String(FALLBACK_COORDINATES.lng);
  }

  let imageFrontMatter = "";
  let altText = normalizeValue(options.alt) || `${title} - ${category.replace(/-/g, " ")} field note`;
  const filename = `${postDate}-${slug}.md`;
  const filePath = path.join(postsDir, filename);

  if (fs.existsSync(filePath)) {
    console.error(`Post already exists: _posts/${filename}`);
    process.exit(1);
  }

  if (imagePath) {
    const ext = path.extname(resolvedImagePath).toLowerCase();
    const imageFilename = `${postDate}-${slug}${ext}`;
    const destination = path.join(imagesDir, imageFilename);

    fs.copyFileSync(resolvedImagePath, destination);

    imageFrontMatter = `/images/${imageFilename}`;
    if (!normalizeValue(options.alt)) {
      altText = title;
    }
  }

  const frontMatter = [];
  frontMatter.push("---");
  if (normalizedLayout === "build") {
    frontMatter.push("layout: build");
  }
  frontMatter.push(`title: ${yamlString(title)}`);
  frontMatter.push(`date: ${formatDateForFrontMatter(postTimestamp)}`);
  if (imageFrontMatter) {
    frontMatter.push(`image: ${imageFrontMatter}`);
  }
  frontMatter.push(`category: ${category}`);
  if (tags.length > 0) {
    frontMatter.push(`tags: [${tags.map((tag) => yamlString(tag)).join(", ")}]`);
  }
  if (normalizedMode) {
    frontMatter.push(`mode: ${normalizedMode}`);
  }
  if (normalizeValue(options.project)) {
    frontMatter.push(`project: ${yamlString(normalizeValue(options.project))}`);
  }
  if (normalizeValue(options.stage)) {
    frontMatter.push(`stage: ${yamlString(normalizeValue(options.stage))}`);
  }
  if (location) {
    frontMatter.push(`location: ${yamlString(location)}`);
  }
  if (coordinatesLat && coordinatesLng) {
    frontMatter.push("coordinates:");
    frontMatter.push(`  lat: ${Number(coordinatesLat)}`);
    frontMatter.push(`  lng: ${Number(coordinatesLng)}`);
  }

  const conditionWeather = normalizeValue(options.weather);
  const conditionTemperature = normalizeValue(options.temperature);
  const conditionLight = normalizeValue(options.light);
  if (conditionWeather || conditionTemperature || conditionLight) {
    frontMatter.push("conditions:");
    if (conditionWeather) {
      frontMatter.push(`  weather: ${yamlString(conditionWeather)}`);
    }
    if (conditionTemperature) {
      frontMatter.push(`  temperature: ${yamlString(conditionTemperature)}`);
    }
    if (conditionLight) {
      frontMatter.push(`  light: ${yamlString(conditionLight)}`);
    }
  }

  appendListBlock(frontMatter, "gear", gear);
  appendListBlock(frontMatter, "parts", parts);
  appendListBlock(frontMatter, "changes", changes);
  appendListBlock(frontMatter, "lessons", lessons);

  if (altText && imageFrontMatter) {
    frontMatter.push(`alt: ${yamlString(altText)}`);
  }

  frontMatter.push("---");

  const bodyText = normalizeValue(options.text) || "Write your field note here.";
  const content = `${frontMatter.join("\n")}\n\n${bodyText}\n`;

  fs.writeFileSync(filePath, content);

  console.log(`Created post: _posts/${filename}`);

  if (imagePath) {
    console.log(`Copied image: ${imageFrontMatter}`);
  }

  if (options.useExif) {
    for (const warning of exifMeta.warnings) {
      console.warn(`EXIF: ${warning}`);
    }

    if (exifMeta.captureDate) {
      console.log(`EXIF capture date applied: ${formatDateForFrontMatter(postTimestamp)}`);
    }

    if (exifMeta.coordinates) {
      console.log(`EXIF coordinates detected: ${exifMeta.coordinates.lat}, ${exifMeta.coordinates.lng}`);
    }
  }

  console.log(`Category: ${category}`);
  console.log(`Layout: ${normalizedLayout}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
