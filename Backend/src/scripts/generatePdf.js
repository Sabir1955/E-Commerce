const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const mdPath = path.resolve(__dirname, "../../../security-reports/SECURITY_AUDIT_REPORT.md");
const htmlPath = path.resolve(__dirname, "../../../security-reports/SECURITY_AUDIT_REPORT.html");
const pdfPath = path.resolve(__dirname, "../../../security-reports/SECURITY_AUDIT_REPORT.pdf");

const md = fs.readFileSync(mdPath, "utf8");

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let htmlContent = "";
const lines = md.split("\n");
let inCode = false;
let inTable = false;
let inList = false;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  // Code blocks
  if (line.startsWith("```")) {
    if (inCode) {
      htmlContent += "</code></pre>\n";
      inCode = false;
    } else {
      if (inList) { htmlContent += "</ul>\n"; inList = false; }
      if (inTable) { htmlContent += "</table>\n"; inTable = false; }
      htmlContent += "<pre><code>";
      inCode = true;
    }
    continue;
  }
  if (inCode) {
    htmlContent += escapeHtml(line) + "\n";
    continue;
  }

  // Lists
  if (line.startsWith("- ") || line.startsWith("* ")) {
    if (!inList) {
      htmlContent += "<ul>\n";
      inList = true;
    }
    let content = line.slice(2).trim();
    // format inline markdown
    content = content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    htmlContent += `  <li>${content}</li>\n`;
    continue;
  } else if (inList && !line.startsWith("  ")) {
    htmlContent += "</ul>\n";
    inList = false;
  }

  // Tables
  if (line.startsWith("|")) {
    if (!inTable) {
      htmlContent += "<table class=\"report-table\">\n";
      inTable = true;
    }
    if (line.includes("---")) continue;
    const cols = line.split("|").slice(1, -1);
    const isHeader = i > 0 && lines[i - 1].startsWith("|") && lines[i + 1] && lines[i + 1].includes("---");
    const tag = isHeader ? "th" : "td";
    const cells = cols.map(c => {
      let text = c.trim()
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      return `<${tag}>${text}</${tag}>`;
    }).join("");
    htmlContent += `  <tr>${cells}</tr>\n`;
    continue;
  } else if (inTable) {
    htmlContent += "</table>\n";
    inTable = false;
  }

  // Headings
  if (line.startsWith("# ")) {
    htmlContent += `<h1>${escapeHtml(line.slice(2))}</h1>\n`;
  } else if (line.startsWith("## ")) {
    htmlContent += `<h2>${escapeHtml(line.slice(3))}</h2>\n`;
  } else if (line.startsWith("### ")) {
    htmlContent += `<h3>${escapeHtml(line.slice(4))}</h3>\n`;
  } else if (line.startsWith("#### ")) {
    htmlContent += `<h4>${escapeHtml(line.slice(5))}</h4>\n`;
  } else if (line.startsWith("> [!")) {
    // Alert block
    htmlContent += `<div class="alert alert-info"><p><strong>${escapeHtml(line.slice(2))}</strong></p>\n`;
  } else if (line.startsWith("> ")) {
    htmlContent += `<p>${escapeHtml(line.slice(2))}</p></div>\n`;
  } else if (line.trim() === "---") {
    htmlContent += "<hr>\n";
  } else if (line.trim().length > 0) {
    let p = line
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    htmlContent += `<p>${p}</p>\n`;
  }
}

if (inTable) htmlContent += "</table>\n";
if (inList) htmlContent += "</ul>\n";
if (inCode) htmlContent += "</code></pre>\n";

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Security Audit & Remediation Report - Sacred Astrology E-Commerce</title>
<style>
  @page {
    margin: 18mm 15mm 18mm 15mm;
    size: A4;
    @bottom-right {
      content: "Page " counter(page);
      font-size: 8pt;
      color: #64748b;
    }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.6;
    font-size: 10.5pt;
    margin: 0;
    padding: 20px;
  }
  h1 {
    color: #0f172a;
    font-size: 22pt;
    font-weight: 700;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 16px;
  }
  h2 {
    color: #1e3a8a;
    font-size: 15pt;
    font-weight: 600;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
    margin-top: 28px;
    margin-bottom: 12px;
    page-break-after: avoid;
  }
  h3 {
    color: #1e40af;
    font-size: 12pt;
    font-weight: 600;
    margin-top: 18px;
    margin-bottom: 8px;
    page-break-after: avoid;
  }
  h4 {
    color: #334155;
    font-size: 11pt;
    font-weight: 600;
    margin-top: 14px;
    margin-bottom: 6px;
    page-break-after: avoid;
  }
  p {
    margin-top: 0;
    margin-bottom: 10px;
  }
  ul {
    margin-top: 0;
    margin-bottom: 12px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 4px;
  }
  code {
    background: #f1f5f9;
    color: #0f172a;
    padding: 2px 5px;
    border-radius: 4px;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
    font-size: 9.5pt;
    border: 1px solid #e2e8f0;
  }
  pre {
    background: #0f172a;
    color: #f8fafc;
    padding: 12px 14px;
    border-radius: 6px;
    overflow-x: auto;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.45;
    margin: 12px 0;
    page-break-inside: avoid;
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    border: none;
  }
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 18px 0;
    font-size: 9pt;
    page-break-inside: avoid;
  }
  table.report-table th {
    background: #1e3a8a;
    color: #ffffff;
    font-weight: 600;
    padding: 8px 10px;
    text-align: left;
    border: 1px solid #1e3a8a;
  }
  table.report-table td {
    padding: 7px 10px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
  }
  table.report-table tr:nth-child(even) td {
    background: #f8fafc;
  }
  .alert {
    background: #eff6ff;
    border-left: 4px solid #3b82f6;
    padding: 10px 14px;
    border-radius: 0 6px 6px 0;
    margin: 14px 0;
  }
  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20px 0;
  }
  strong {
    color: #0f172a;
  }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

fs.writeFileSync(htmlPath, fullHtml, "utf8");
console.log(`Generated HTML at ${htmlPath}`);

try {
  console.log("Compiling PDF with headless Chrome...");
  const cmd = `google-chrome --headless --no-sandbox --disable-gpu --print-to-pdf="${pdfPath}" "file://${htmlPath}"`;
  const output = execSync(cmd, { encoding: "utf8" });
  console.log(output || "PDF compiled successfully!");
  
  if (fs.existsSync(pdfPath)) {
    const stats = fs.statSync(pdfPath);
    console.log(`SUCCESS: PDF compiled (${stats.size} bytes) at ${pdfPath}`);
  }
  
  // Clean up temporary HTML file
  fs.unlinkSync(htmlPath);
  console.log("Cleaned up temporary HTML file.");
} catch (err) {
  console.error("Error generating PDF:", err.message);
  process.exit(1);
}
