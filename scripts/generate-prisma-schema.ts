import fs from "fs";
import path from "path";

const VERCEL_ENV = process.env.VERCEL_ENV || "development";

const PREFIX_MAP: Record<string, string> = {
  production: "",
  preview: "preview_",
  development: "dev_",
};

const prefix = PREFIX_MAP[VERCEL_ENV] ?? "dev_";

console.log(
  `[prisma-schema] VERCEL_ENV=${VERCEL_ENV}, using prefix: "${prefix || "(none)"}"`
);

const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
const outputPath = path.join(__dirname, "../prisma/schema.generated.prisma");

let schema = fs.readFileSync(schemaPath, "utf-8");

// Find all model names
const modelRegex = /^model\s+(\w+)\s*\{/gm;
const models: string[] = [];
let match;

while ((match = modelRegex.exec(schema)) !== null) {
  models.push(match[1]);
}

// For each model, add @@map before the closing brace (only if prefix is set)
if (prefix) {
  for (const modelName of models) {
    const tableName = `${prefix}${modelName}`;
    // Match the model block and insert @@map before the closing brace
    const modelBlockRegex = new RegExp(
      `(model\\s+${modelName}\\s*\\{[\\s\\S]*?)(\\n\\})`,
      "m"
    );
    schema = schema.replace(modelBlockRegex, `$1\n  @@map("${tableName}")$2`);
  }
}

fs.writeFileSync(outputPath, schema);
console.log(`[prisma-schema] Generated: prisma/schema.generated.prisma`);
console.log(
  `[prisma-schema] Tables: ${models.map((m) => (prefix || "") + m).join(", ")}`
);
