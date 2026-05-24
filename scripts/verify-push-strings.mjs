#!/usr/bin/env node
// PWA Push — Korean 문자열 존재/부재 검증
// 실행: node scripts/verify-push-strings.mjs
// 또는: pnpm verify:push-strings

import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(".");

/** 디렉터리를 재귀적으로 순회하여 파일 목록 반환 */
function getAllFiles(dirPath) {
  const results = [];
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const full = join(dirPath, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...getAllFiles(full));
        } else {
          results.push(full);
        }
      } catch {
        // 접근 불가 파일 skip
      }
    }
  } catch {
    // 디렉터리 없으면 empty
  }
  return results;
}

/** 파일 또는 디렉터리에서 패턴 검색 (grep 동등) */
function grepIn(pattern, targetPath) {
  const absPath = resolve(ROOT, targetPath);
  let filesToSearch;

  try {
    const stat = statSync(absPath);
    filesToSearch = stat.isDirectory() ? getAllFiles(absPath) : [absPath];
  } catch {
    return { found: false, matches: [] };
  }

  const matches = [];
  for (const file of filesToSearch) {
    // 소스 파일만 검사
    if (!/\.(ts|tsx|js|mjs|json)$/.test(file)) continue;
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (
          typeof pattern === "string"
            ? lines[i].includes(pattern)
            : pattern.test(lines[i])
        ) {
          matches.push({ file, line: i + 1, text: lines[i].trim() });
        }
      }
    } catch {
      // 읽기 실패 skip
    }
  }

  return { found: matches.length > 0, matches };
}

// ── 검증 목록 ─────────────────────────────────────────────────────────────────

const PRESENT = [
  {
    pattern: "그레이딩 진행 알림",
    files: ["src/constants/notifications.ts"],
  },
  {
    pattern: "주문 상태가 업데이트되었습니다",
    files: ["src/constants/notifications.ts"],
  },
  {
    pattern: "홈 화면에 추가하면 알림을 받을 수 있어요",
    files: ["src/components/pwa/install-banner.tsx"],
  },
];

const ABSENT = [
  // payload body에 주문번호 패턴 없음 (PII)
  {
    pattern: /\d{8}-\d+/,
    label: "주문번호 패턴 (PII)",
    files: ["src/lib/push/"],
  },
  // grading company 이름이 push payload에 노출되지 않아야 함
  {
    pattern: /\bPSA\b|\bBGS\b|\bCGC\b|\bBRG\b/,
    label: "그레이딩사 이름 (PII)",
    files: ["src/lib/push/"],
  },
];

// ── 실행 ──────────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

console.log("=== PWA Push — Korean String Verification ===\n");

// PRESENT 검증
for (const { pattern, files } of PRESENT) {
  for (const f of files) {
    const { found, matches } = grepIn(pattern, f);
    if (found) {
      console.log(`[OK] PRESENT: "${pattern}" in ${f}`);
      passCount++;
    } else {
      console.log(`[FAIL] MISSING: "${pattern}" in ${f}`);
      failCount++;
    }
  }
}

// ABSENT 검증
for (const { pattern, label, files } of ABSENT) {
  for (const f of files) {
    const { found, matches } = grepIn(pattern, f);
    if (found) {
      const preview = matches
        .slice(0, 3)
        .map((m) => `  ${m.file}:${m.line}: ${m.text}`)
        .join("\n");
      console.log(`[FAIL] PII LEAK: ${label} (${pattern}) in ${f}`);
      console.log(preview);
      failCount++;
    } else {
      console.log(`[OK] ABSENT: ${label} (${pattern.source ?? pattern}) in ${f}`);
      passCount++;
    }
  }
}

console.log(`\nTotal: ${passCount + failCount} checks — ${passCount} PASS, ${failCount} FAIL`);
process.exit(failCount > 0 ? 1 : 0);
