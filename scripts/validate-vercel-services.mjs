import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve("vercel.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const expected = {
  api: { root: ".", runtime: "container", entrypoint: "Dockerfile" },
  "admin-console": { root: "apps/web/admin-console", framework: "nextjs" },
  "business-workspace": { root: "apps/web/business-workspace", framework: "nextjs" },
  "individual-workspace": {
    root: "apps/web/individual-workspace",
    framework: "nextjs",
  },
  marketplace: { root: "apps/web/marketplace", framework: "nextjs" },
  "public-website": { root: "apps/web/public-website", framework: "nextjs" },
};

const errors = [];
const services = config.services;

if (!services || typeof services !== "object" || Array.isArray(services)) {
  errors.push('vercel.json must declare a top-level "services" object.');
} else {
  for (const [name, required] of Object.entries(expected)) {
    const service = services[name];
    if (!service) {
      errors.push(`Missing required Vercel service: ${name}`);
      continue;
    }

    if (service.root !== required.root) {
      errors.push(`Service "${name}" must use root "${required.root}".`);
    }
    if (required.runtime && service.runtime !== required.runtime) {
      errors.push(`Service "${name}" must use runtime "${required.runtime}".`);
    }
    if (required.entrypoint && service.entrypoint !== required.entrypoint) {
      errors.push(
        `Service "${name}" must use entrypoint "${required.entrypoint}".`,
      );
    }
    if (required.framework && service.framework !== required.framework) {
      errors.push(
        `Service "${name}" must use framework "${required.framework}".`,
      );
    }

    const rootPath = resolve(service.root);
    if (!existsSync(rootPath)) {
      errors.push(`Service "${name}" root does not exist: ${service.root}`);
    }
  }

  for (const name of Object.keys(services)) {
    if (!Object.hasOwn(expected, name)) {
      errors.push(`Unexpected Vercel service declaration: ${name}`);
    }
  }
}

if (!existsSync(resolve("Dockerfile"))) {
  errors.push('The API container entrypoint "Dockerfile" is missing.');
}

const rewrites = config.rewrites;
if (!Array.isArray(rewrites) || rewrites.length === 0) {
  errors.push("vercel.json must declare service rewrites.");
} else {
  for (const [index, rewrite] of rewrites.entries()) {
    const serviceName = rewrite?.destination?.service;
    if (typeof serviceName !== "string" || !expected[serviceName]) {
      errors.push(
        `Rewrite ${index + 1} must target a declared Vercel service.`,
      );
    }
  }

  const finalRewrite = rewrites.at(-1);
  if (
    finalRewrite?.source !== "/(.*)" ||
    finalRewrite?.destination?.service !== "public-website"
  ) {
    errors.push(
      'The final catch-all rewrite must route "/(.*)" to "public-website".',
    );
  }
}

if (errors.length > 0) {
  console.error("Vercel Services manifest validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Vercel Services manifest is valid: API plus five Next.js services and declared rewrites.",
  );
}
