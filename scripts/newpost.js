const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(`
Usage:
npm run newpost "Post title" -- --image ./path/to/photo.jpg --text "Short note text"

Examples:
npm run newpost "First spring garden check" -- --image ./photos/garden.jpg --text "Checked the lettuce and onions after the rain."
npm run newpost "Evening radio check from camp" -- --image ./camp.jpg --text "Made a quick contact before sunset."
`);
  process.exit(1);
}

const titleParts = [];
let imagePath = "";
let noteText = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--image") {
    imagePath = args[i + 1] || "";
    i++;
  } else if (args[i] === "--text") {
    noteText = args[i + 1] || "";
    i++;
  } else {
    titleParts.push(args[i]);
  }
}

const title = titleParts.join(" ").trim();

if (!title) {
  console.error("Missing post title.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

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
    { key: "rc-crawling", words: ["crawler", "scx24", "trail rig", "rocks", "moab", "course", "rc crawl"] },
    { key: "fpv", words: ["fpv", "aircraft", "plane", "wing", "drone", "quad", "flight", "airfield", "battery", "goggles"] },
    { key: "photography", words: ["photo", "camera", "lens", "shot", "sunset", "portrait", "lightroom", "photography"] },
    { key: "amateur-radio", words: ["radio", "ham", "antenna", "hf", "vhf", "uhf", "qso", "contact", "repeater"] },
    { key: "motorcycling", words: ["motorcycle", "bike", "ride", "road", "helmet", "garage", "oil", "chain"] },
    { key: "camping", words: ["camp", "tent", "trail", "fire", "sleeping bag", "backcountry", "campsite"] },
    { key: "marksmanship", words: ["range", "marksmanship", "target", "zero", "groups", "practice"] }
  ];

  let best = { key: "photography", score: 0 };

  for (const category of categories) {
    const score = category.words.reduce((sum, word) => {
      return sum + (t.includes(word) ? 1 : 0);
    }, 0);

    if (score > best.score) {
      best = { key: category.key, score };
    }
  }

  return best.key;
}

const combinedText = `${title} ${noteText}`;
const category = suggestCategory(combinedText);

const slug = slugify(title);
const postsDir = path.join(process.cwd(), "_posts");
const imagesDir = path.join(process.cwd(), "images");

if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir);
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

let imageFrontMatter = "/images/replace-me.jpg";
let altText = `${title} - ${category.replace("-", " ")} field note`;

if (imagePath) {
  const resolvedImagePath = path.resolve(process.cwd(), imagePath);

  if (!fs.existsSync(resolvedImagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  const ext = path.extname(resolvedImagePath).toLowerCase();
  const imageFilename = `${today}-${slug}${ext}`;
  const destination = path.join(imagesDir, imageFilename);

  fs.copyFileSync(resolvedImagePath, destination);

  imageFrontMatter = `/images/${imageFilename}`;
  altText = `${title}`;
}

const filename = `${today}-${slug}.md`;
const filePath = path.join(postsDir, filename);

if (fs.existsSync(filePath)) {
  console.error(`Post already exists: _posts/${filename}`);
  process.exit(1);
}

const content = `---
title: "${title}"
image: ${imageFrontMatter}
category: ${category}
location: ""
alt: "${altText}"
---

${noteText || "Write your field note here."}
`;

fs.writeFileSync(filePath, content);

console.log(`Created post: _posts/${filename}`);

if (imagePath) {
  console.log(`Copied image: ${imageFrontMatter}`);
}

console.log(`Suggested category: ${category}`);