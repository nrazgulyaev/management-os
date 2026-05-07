/**
 * Stage 6.P3.B — Statement parsers public surface.
 *
 * Single import for the import wizard + service layer:
 *
 *     import {
 *       parseCsvStatement, detectCsvDialect, autoDetectColumnMapping,
 *       parseOfxStatement,
 *       parsePdfText, autoDetectPdfTemplate, listPdfTemplates,
 *       parseMt940Statement,
 *     } from "@/lib/banking/parsers";
 *
 * All parsers return a `ParseResult` envelope (`rows` +
 * `diagnostics`) so the import wizard can surface a uniform preview
 * regardless of source format.
 */

export type {
  ParsedStatementRow,
  ParseDiagnostics,
  ParseResult,
} from "./types";
export {
  parseAmountToMinor,
  autoDetectAmountFormat,
  parseDateFlexible,
  synthesizeTransactionId,
} from "./types";

export type { CSVColumnMapping, CSVParseOptions, CSVDialect } from "./csv-parser";
export {
  parseCsvStatement,
  detectCsvDialect,
  autoDetectColumnMapping,
  __resetPapaparseCacheForTests,
} from "./csv-parser";

export {
  parseOfxStatement,
  ofxSgmlToXml,
  ofxDate,
  __resetOfxParserCacheForTests,
} from "./ofx-parser";

export type { PdfStatementTemplate } from "./pdf-parser";
export {
  parsePdfText,
  autoDetectPdfTemplate,
  registerPdfTemplate,
  getPdfTemplate,
  listPdfTemplates,
} from "./pdf-parser";

export {
  parseMt940Statement,
  parseStatementLine,
  tokenizeTags,
} from "./mt940-parser";
