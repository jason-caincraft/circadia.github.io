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
npm run newpost "Post title" -- --images "./path/to/photo-a.jpg|./path/to/photo-b.jpg" --text "Short note text"

Optional metadata:
  --layout post|build
  --image-layout essay
  --video ./path/to/video.mp4
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
npm run newpost "Camp dawn" -- --images "./photos/camp-dawn.jpg|./photos/camp-kitchen.jpg" --text "Cold air and quiet coffee." --use-exif
npm run newpost "Camp dawn essay" -- --images "./photos/camp-dawn.jpg|./photos/camp-kitchen.jpg" --image-layout essay --text "Cold air and quiet coffee."
npm run newpost "Creek crossing clip" -- --video ./clips/creek-crossing.mp4 --location "Thorne Creek" --text "Short line choice test with the truck."
npm run newpost "SCX6 backyard suspension test" -- --layout build --mode build --project "Axial SCX6 Jeep" --stage "Suspension tuning" --parts "Softer rear springs | Wheel weights"
`);
  process.exit(1);
}

const FLAG_NAMES = new Set([
  "--image",
  "--images",
  "--video",
  "--text",
  "--layout",
  "--image-layout",
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
const VALID_IMAGE_LAYOUTS = new Set(["essay"]);
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

const titleParts = [];
const options = {
  image: "",
  images: "",
  video: "",
  text: "",
  layout: "post",
  imageLayout: "",
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
  } else if (arg === "--images") {
    options.images = readFlagValue(i);
    i++;
  } else if (arg === "--video") {
    options.video = readFlagValue(i);
    i++;
  } else if (arg === "--text") {
    options.text = readFlagValue(i);
    i++;
  } else if (arg === "--layout") {
    options.layout = readFlagValue(i);
    i++;
  } else if (arg === "--image-layout") {
    options.imageLayout = readFlagValue(i);
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

function buildEmptyExifMeta(imagePath) {
  return {
    imagePath,
    captureDate: null,
    fileDate: "",
    coordinates: null,
    warnings: []
  };
}

async function readExifMeta(imagePath) {
  const meta = buildEmptyExifMeta(imagePath);

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
  } catch (error) {
    meta.warnings.push(`EXIF lookup failed for ${path.basename(imagePath)}: ${error.message}`);
  }

  return meta;
}

function dedupeImagePaths(imagePaths) {
  const seen = new Set();
  const unique = [];

  for (const imagePath of imagePaths) {
    const key = imagePath.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(imagePath);
  }

  return unique;
}

function resolveImageInputValues() {
  return [
    ...parseList(options.images, /\|/),
    ...parseList(options.image, /\|/)
  ];
}

function choosePrimaryImageIndex(imageMetaList) {
  let oldestIndex = -1;

  for (let i = 0; i < imageMetaList.length; i++) {
    const currentMeta = imageMetaList[i];
    if (!(currentMeta.captureDate instanceof Date) || Number.isNaN(currentMeta.captureDate.getTime())) {
      continue;
    }

    if (oldestIndex === -1 || currentMeta.captureDate.getTime() < imageMetaList[oldestIndex].captureDate.getTime()) {
      oldestIndex = i;
    }
  }

  return oldestIndex;
}

async function readExifMetaForImages(imagePaths) {
  const imageMetaList = imagePaths.length === 0
    ? []
    : await Promise.all(imagePaths.map((imagePath) => readExifMeta(imagePath)));
  const oldestIndex = choosePrimaryImageIndex(imageMetaList);

  return {
    imageMetaList,
    featuredSourceIndex: oldestIndex >= 0 ? oldestIndex : 0,
    oldestIndex,
    oldestMeta: oldestIndex >= 0 ? imageMetaList[oldestIndex] : buildEmptyExifMeta(imagePaths[0] || ""),
    warnings: imageMetaList.flatMap((meta) => meta.warnings)
  };
}

function copyImages(resolvedImagePaths, featuredSourceIndex, imagesDir, postDate, slug) {
  const copiedImagePaths = [];
  let suffixNumber = 2;

  for (let i = 0; i < resolvedImagePaths.length; i++) {
    const resolvedImagePath = resolvedImagePaths[i];
    const ext = path.extname(resolvedImagePath).toLowerCase();
    const suffix = i === featuredSourceIndex ? "" : `-${padNumber(suffixNumber++)}`;
    const imageFilename = `${postDate}-${slug}${suffix}${ext}`;
    const destination = path.join(imagesDir, imageFilename);
    const publicPath = `/images/${imageFilename}`;

    fs.copyFileSync(resolvedImagePath, destination);
    copiedImagePaths.push(publicPath);
  }

  return copiedImagePaths;
}

async function main() {
  const normalizedLayout = normalizeValue(options.layout || "post").toLowerCase() || "post";
  if (!VALID_LAYOUTS.has(normalizedLayout)) {
    console.error(`Invalid layout: ${options.layout}. Use "post" or "build".`);
    process.exit(1);
  }

  const normalizedImageLayout = normalizeValue(options.imageLayout).toLowerCase();
  if (normalizedImageLayout && !VALID_IMAGE_LAYOUTS.has(normalizedImageLayout)) {
    console.error(`Invalid image layout: ${options.imageLayout}. Use "essay".`);
    process.exit(1);
  }
  if (normalizedImageLayout && normalizedLayout !== "post") {
    console.error("Image layout is only supported for standard posts with --layout post.");
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
  const videosDir = path.join(process.cwd(), "videos");
  const slug = slugify(title);
  const defaultTimestamp = new Date();
  const defaultDate = formatDateForFilename(defaultTimestamp);

  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir);
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
  }
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir);
  }

  const requestedImagePaths = resolveImageInputValues();
  const resolvedImagePaths = dedupeImagePaths(
    requestedImagePaths.map((imagePath) => path.resolve(process.cwd(), imagePath))
  );

  for (const resolvedImagePath of resolvedImagePaths) {
    if (!fs.existsSync(resolvedImagePath)) {
      console.error(`Image not found: ${resolvedImagePath}`);
      process.exit(1);
    }
  }

  const videoPath = normalizeValue(options.video);
  let resolvedVideoPath = "";
  if (videoPath) {
    resolvedVideoPath = path.resolve(process.cwd(), videoPath);

    if (!fs.existsSync(resolvedVideoPath)) {
      console.error(`Video not found: ${videoPath}`);
      process.exit(1);
    }
  }

  let postDate = defaultDate;
  let postTimestamp = defaultTimestamp;
  let featuredSourceIndex = 0;
  let exifState = {
    imageMetaList: [],
    featuredSourceIndex: 0,
    oldestIndex: -1,
    oldestMeta: buildEmptyExifMeta(resolvedImagePaths[0] || ""),
    warnings: []
  };

  if (options.useExif) {
    if (resolvedImagePaths.length === 0) {
      exifState.warnings.push("EXIF lookup skipped because no image path was provided.");
    } else {
      exifState = await readExifMetaForImages(resolvedImagePaths);
      featuredSourceIndex = exifState.oldestIndex >= 0 ? exifState.featuredSourceIndex : 0;

      if (exifState.oldestMeta.captureDate) {
        postTimestamp = exifState.oldestMeta.captureDate;
        postDate = exifState.oldestMeta.fileDate;
      } else {
        exifState.warnings.push("No EXIF capture date was found in the selected photos. Using the current local date and time instead.");
      }

      if (!coordinatesLat && !coordinatesLng && exifState.oldestMeta.coordinates) {
        coordinatesLat = String(exifState.oldestMeta.coordinates.lat);
        coordinatesLng = String(exifState.oldestMeta.coordinates.lng);
      } else if (!coordinatesLat && !coordinatesLng) {
        exifState.warnings.push("No EXIF GPS coordinates were found on the oldest selected photo.");
      }
    }
  }

  let featuredImageFrontMatter = "";
  let imageFrontMatterList = [];
  let videoFrontMatter = "";
  let altText = normalizeValue(options.alt) || `${title} - ${category.replace(/-/g, " ")} field note`;
  const filename = `${postDate}-${slug}.md`;
  const filePath = path.join(postsDir, filename);

  if (fs.existsSync(filePath)) {
    console.error(`Post already exists: _posts/${filename}`);
    process.exit(1);
  }

  if (resolvedImagePaths.length > 0) {
    imageFrontMatterList = copyImages(resolvedImagePaths, featuredSourceIndex, imagesDir, postDate, slug);
    featuredImageFrontMatter = imageFrontMatterList[featuredSourceIndex] || imageFrontMatterList[0] || "";

    if (!normalizeValue(options.alt)) {
      altText = title;
    }
  }

  if (videoPath) {
    const ext = path.extname(resolvedVideoPath).toLowerCase();
    const videoFilename = `${postDate}-${slug}${ext}`;
    const destination = path.join(videosDir, videoFilename);

    fs.copyFileSync(resolvedVideoPath, destination);

    videoFrontMatter = `/videos/${videoFilename}`;
  }

  const frontMatter = [];
  frontMatter.push("---");
  if (normalizedLayout === "build") {
    frontMatter.push("layout: build");
  }
  frontMatter.push(`title: ${yamlString(title)}`);
  frontMatter.push(`date: ${formatDateForFrontMatter(postTimestamp)}`);
  if (videoFrontMatter) {
    frontMatter.push(`video: ${videoFrontMatter}`);
  }
  if (featuredImageFrontMatter) {
    frontMatter.push(`image: ${featuredImageFrontMatter}`);
  }
  if (imageFrontMatterList.length > 1) {
    appendListBlock(frontMatter, "images", imageFrontMatterList);
  }
  if (normalizedImageLayout) {
    frontMatter.push(`image_layout: ${normalizedImageLayout}`);
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

  if (altText && featuredImageFrontMatter) {
    frontMatter.push(`alt: ${yamlString(altText)}`);
  }

  frontMatter.push("---");

  const bodyText = normalizeValue(options.text) || "Write your field note here.";
  const content = `${frontMatter.join("\n")}\n\n${bodyText}\n`;

  fs.writeFileSync(filePath, content);

  console.log(`Created post: _posts/${filename}`);

  if (featuredImageFrontMatter) {
    console.log(`Copied ${imageFrontMatterList.length} image${imageFrontMatterList.length === 1 ? "" : "s"}.`);
    console.log(`Featured image: ${featuredImageFrontMatter}`);
  }
  if (imageFrontMatterList.length > 1) {
    if (normalizedImageLayout === "essay") {
      console.log("Essay images:");
    } else {
      console.log("Gallery images:");
    }
    for (const imageFrontMatterPath of imageFrontMatterList) {
      console.log(`- ${imageFrontMatterPath}`);
    }
  }
  if (videoPath) {
    console.log(`Copied video: ${videoFrontMatter}`);
  }

  if (options.useExif) {
    for (const warning of exifState.warnings) {
      console.warn(`EXIF: ${warning}`);
    }

    if (exifState.oldestMeta.captureDate) {
      console.log(`EXIF capture date applied from oldest photo: ${formatDateForFrontMatter(postTimestamp)}`);
    }

    if (exifState.oldestMeta.coordinates) {
      console.log(`EXIF coordinates detected on oldest photo: ${exifState.oldestMeta.coordinates.lat}, ${exifState.oldestMeta.coordinates.lng}`);
    }
  }

  console.log(`Category: ${category}`);
  console.log(`Layout: ${normalizedLayout}`);
  if (normalizedImageLayout) {
    console.log(`Image layout: ${normalizedImageLayout}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
