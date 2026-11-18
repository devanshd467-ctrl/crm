/** Read-only workbook inventory. Never import or guess contact / project relationships. */
import XLSX from "xlsx";
import path from "node:path";
import { existsSync } from "node:fs";
import { normalizePhone } from "../server/core.js";
const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("Usage: npm run migration:inspect -- /path/to/export.xlsx");
  process.exit(1);
}
const book = XLSX.readFile(src, {
  cellDates: false,
  cellFormula: false,
  cellHTML: false,
  cellStyles: false,
  dense: false,
});
const report = {
  file: path.basename(src),
  inspected_at: new Date().toISOString(),
  mode: "Read-only; no customer rows or CRM tables are modified.",
  sheets: [],
};
for (const name of book.SheetNames) {
  const sheet = book.Sheets[name];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  const headers = (data[0] || []).map((v) => String(v).trim());
  const phones = headers.findIndex((h) =>
    /^(primary\s+)?(mobile|phone)(\s+(number|no\.?))?$/i.test(h),
  );
  let invalid = 0,
    duplicates = 0;
  const seen = new Set();
  if (phones >= 0) {
    for (let i = 1; i < data.length; i++) {
      try {
        const phone = normalizePhone(data[i][phones]);
        if (seen.has(phone)) duplicates++;
        seen.add(phone);
      } catch {
        invalid++;
      }
    }
  }
  report.sheets.push({
    sheet: name,
    headers,
    nonempty_data_rows: Math.max(0, data.length - 1),
    ...(phones >= 0
      ? {
          phone_column: headers[phones],
          unique_valid_phones: seen.size,
          invalid_or_missing_phones: invalid,
          repeat_phone_rows: duplicates,
        }
      : {}),
    review:
      "Verify the header row, historical IDs and linked-record mappings before migration.",
  });
}
console.log(JSON.stringify(report, null, 2));
