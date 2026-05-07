/**
 * Stage 6.P3.B — Statement parsers (CSV / OFX / PDF / MT940).
 *
 * Pure-helper invariants — no DB, no network. Verifies:
 *   - Amount parser handles standard + European format, parens
 *     negatives, leading signs, currency symbols.
 *   - Date parser handles ISO / dmy / mdy / short year.
 *   - CSV dialect detection picks the right delimiter + header
 *     presence; auto-mapping suggests sensible columns from real-world
 *     headers (English, Indonesian, Russian).
 *   - CSV parse round-trip with `mixed` and `separate_columns` amount
 *     conventions; idempotent transaction-ID synthesis when the
 *     source doesn't supply one.
 *   - OFX 1.x (SGML) and 2.x (XML) parse the same statement to the
 *     same row count; FITID, DTPOSTED, TRNAMT, NAME map correctly;
 *     credit-card statements parse via CCSTMTRS.
 *   - PDF Mandiri + BCA templates extract sample-statement rows;
 *     auto-detect picks the right template; unknown template ID
 *     surfaces a clean error.
 *   - MT940 :61: lines parse with value-date, debit/credit sign,
 *     refs after `//`; :86: narrative attaches to the preceding :61:.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseAmountToMinor,
  autoDetectAmountFormat,
  parseDateFlexible,
  synthesizeTransactionId,
  detectCsvDialect,
  autoDetectColumnMapping,
  parseCsvStatement,
  parseOfxStatement,
  ofxSgmlToXml,
  ofxDate,
  parsePdfText,
  autoDetectPdfTemplate,
  listPdfTemplates,
  registerPdfTemplate,
  getPdfTemplate,
  parseMt940Statement,
  parseStatementLine,
  tokenizeTags,
} from "../src/lib/banking/parsers";

// ===========================================================================
// 1) Amount parser
// ===========================================================================

test("parseAmountToMinor: standard format with comma thousands", () => {
  assert.equal(parseAmountToMinor("1,234.56"), 123456n);
  assert.equal(parseAmountToMinor("0.05"), 5n);
  assert.equal(parseAmountToMinor("100"), 10000n);
});

test("parseAmountToMinor: European format with dot thousands + comma decimal", () => {
  assert.equal(parseAmountToMinor("1.234,56"), 123456n);
  assert.equal(parseAmountToMinor("1.000.000,00"), 100000000n);
});

test("parseAmountToMinor: parenthesized negatives", () => {
  assert.equal(parseAmountToMinor("(123.45)"), -12345n);
  assert.equal(parseAmountToMinor("(0.01)"), -1n);
});

test("parseAmountToMinor: explicit signs", () => {
  assert.equal(parseAmountToMinor("-1,234.56"), -123456n);
  assert.equal(parseAmountToMinor("+500"), 50000n);
});

test("parseAmountToMinor: currency symbols stripped", () => {
  assert.equal(parseAmountToMinor("$1,234.56"), 123456n);
  assert.equal(parseAmountToMinor("Rp 1.000.000,00"), 100000000n);
  assert.equal(parseAmountToMinor("€500,00"), 50000n);
});

test("parseAmountToMinor: returns null on garbage", () => {
  assert.equal(parseAmountToMinor("abc"), null);
  assert.equal(parseAmountToMinor(""), null);
  assert.equal(parseAmountToMinor("   "), null);
});

test("parseAmountToMinor: respects custom decimals (e.g. JPY=0)", () => {
  assert.equal(parseAmountToMinor("1500", { decimals: 0 }), 1500n);
});

test("autoDetectAmountFormat: european when comma is the last separator", () => {
  assert.equal(autoDetectAmountFormat("1.234,56"), "european");
  assert.equal(autoDetectAmountFormat("1234,56"), "european");
});

test("autoDetectAmountFormat: standard when dot is the last separator", () => {
  assert.equal(autoDetectAmountFormat("1,234.56"), "standard");
  assert.equal(autoDetectAmountFormat("1234.56"), "standard");
});

// ===========================================================================
// 2) Date parser
// ===========================================================================

test("parseDateFlexible: ISO yyyy-mm-dd", () => {
  const d = parseDateFlexible("2026-05-07");
  assert.ok(d);
  assert.equal(d.toISOString().slice(0, 10), "2026-05-07");
});

test("parseDateFlexible: European d/m/y default", () => {
  const d = parseDateFlexible("07/05/2026");
  assert.ok(d);
  assert.equal(d.toISOString().slice(0, 10), "2026-05-07");
});

test("parseDateFlexible: US m/d/y when preferred", () => {
  const d = parseDateFlexible("05/07/2026", "mdy_slash");
  assert.ok(d);
  assert.equal(d.toISOString().slice(0, 10), "2026-05-07");
});

test("parseDateFlexible: dotted European 07.05.2026", () => {
  const d = parseDateFlexible("07.05.2026");
  assert.ok(d);
  assert.equal(d.toISOString().slice(0, 10), "2026-05-07");
});

test("parseDateFlexible: short year disambiguation (>50 → 19xx, <=50 → 20xx)", () => {
  const d1 = parseDateFlexible("07/05/26");
  const d2 = parseDateFlexible("07/05/95");
  assert.equal(d1?.toISOString().slice(0, 10), "2026-05-07");
  assert.equal(d2?.toISOString().slice(0, 10), "1995-05-07");
});

test("parseDateFlexible: invalid date returns null", () => {
  assert.equal(parseDateFlexible("13/13/2026"), null);
  assert.equal(parseDateFlexible(""), null);
  assert.equal(parseDateFlexible("not-a-date"), null);
});

test("synthesizeTransactionId: stable + URL-safe slug", () => {
  const id = synthesizeTransactionId({
    source: "csv",
    date: new Date(Date.UTC(2026, 4, 7)),
    amountMinor: -12345n,
    description: "Coffee Shop, Bali",
  });
  assert.match(id, /^csv:2026-05-07:-12345:coffee_shop_bali$/);
});

// ===========================================================================
// 3) CSV dialect detection + auto-mapping
// ===========================================================================

test("detectCsvDialect: comma delimiter with header", () => {
  const csv = "Date,Amount,Description\n2026-05-07,123.45,Coffee\n2026-05-08,67.89,Lunch";
  const d = detectCsvDialect(csv);
  assert.equal(d.delimiter, ",");
  assert.equal(d.hasHeader, true);
  assert.equal(d.dateFormat, "iso");
});

test("detectCsvDialect: semicolon delimiter (German bank style)", () => {
  const csv = "Datum;Betrag;Beschreibung\n07.05.2026;1.234,56;Kaffee";
  const d = detectCsvDialect(csv);
  assert.equal(d.delimiter, ";");
  assert.equal(d.amountFormat, "european");
  assert.equal(d.dateFormat, "dmy_dot");
});

test("detectCsvDialect: tab delimiter", () => {
  const csv = "Date\tAmount\tDescription\n2026-05-07\t100.00\tx";
  const d = detectCsvDialect(csv);
  assert.equal(d.delimiter, "\t");
});

test("detectCsvDialect: empty input → safe defaults", () => {
  const d = detectCsvDialect("");
  assert.equal(d.delimiter, ",");
  assert.equal(d.hasHeader, false);
});

test("autoDetectColumnMapping: English headers", () => {
  const m = autoDetectColumnMapping([
    "Transaction Date",
    "Amount",
    "Description",
    "Counterparty",
    "Reference",
  ]);
  assert.equal(m.date, "Transaction Date");
  assert.equal(m.amount, "Amount");
  assert.equal(m.description, "Description");
  assert.equal(m.counterparty, "Counterparty");
  assert.equal(m.reference, "Reference");
});

test("autoDetectColumnMapping: Indonesian headers", () => {
  const m = autoDetectColumnMapping([
    "Tanggal",
    "Jumlah",
    "Keterangan",
    "Saldo",
  ]);
  assert.equal(m.date, "Tanggal");
  assert.equal(m.amount, "Jumlah");
  assert.equal(m.description, "Keterangan");
  assert.equal(m.balance, "Saldo");
});

test("autoDetectColumnMapping: separate debit + credit columns", () => {
  const m = autoDetectColumnMapping([
    "Date",
    "Debit",
    "Credit",
    "Description",
  ]);
  assert.equal(m.debit, "Debit");
  assert.equal(m.credit, "Credit");
});

test("autoDetectColumnMapping: leaves fields unset when no match", () => {
  const m = autoDetectColumnMapping(["Foo", "Bar", "Baz"]);
  assert.equal(m.date, undefined);
  assert.equal(m.amount, undefined);
});

// ===========================================================================
// 4) CSV full parse
// ===========================================================================

test("parseCsvStatement: mixed amount column with synth transaction IDs", async () => {
  const csv = `Date,Amount,Description
2026-05-07,1234.56,Salary
2026-05-08,-50.00,Coffee shop
2026-05-09,-12.50,Bus ticket`;
  const result = await parseCsvStatement(
    csv,
    { date: "Date", amount: "Amount", description: "Description" },
    { source: "test_csv", defaultCurrency: "EUR" },
  );
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].amountMinor, 123456n);
  assert.equal(result.rows[1].amountMinor, -5000n);
  assert.equal(result.rows[1].description, "Coffee shop");
  assert.equal(result.rows[1].currency, "EUR");
  // Synth IDs are deterministic.
  assert.match(result.rows[0].externalTransactionId, /^test_csv:2026-05-07:/);
  // Period range populated.
  assert.equal(
    result.diagnostics.periodStart!.toISOString().slice(0, 10),
    "2026-05-07",
  );
  assert.equal(
    result.diagnostics.periodEnd!.toISOString().slice(0, 10),
    "2026-05-09",
  );
});

test("parseCsvStatement: separate debit + credit columns", async () => {
  const csv = `Date,Debit,Credit,Description
2026-05-07,,1234.56,Salary
2026-05-08,50.00,,Coffee shop`;
  const result = await parseCsvStatement(
    csv,
    {
      date: "Date",
      debit: "Debit",
      credit: "Credit",
      description: "Description",
    },
    { amountSign: "separate_columns", defaultCurrency: "EUR" },
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].amountMinor, 123456n);
  assert.equal(result.rows[1].amountMinor, -5000n); // debit → negative
});

test("parseCsvStatement: European amount format (semicolon delimiter)", async () => {
  const csv = `Datum;Betrag;Beschreibung
07.05.2026;1.234,56;Kaffee
08.05.2026;-50,00;Mittagessen`;
  const result = await parseCsvStatement(
    csv,
    { date: "Datum", amount: "Betrag", description: "Beschreibung" },
    { defaultCurrency: "EUR" },
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].amountMinor, 123456n);
  assert.equal(result.rows[1].amountMinor, -5000n);
});

test("parseCsvStatement: malformed rows reported in diagnostics, valid rows still emitted", async () => {
  const csv = `Date,Amount,Description
2026-05-07,123.45,Good
not-a-date,456.78,Bad date
2026-05-09,abc,Bad amount
2026-05-10,99.99,Good`;
  const result = await parseCsvStatement(csv, {
    date: "Date",
    amount: "Amount",
    description: "Description",
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.diagnostics.rowsFailed.length, 2);
  assert.match(result.diagnostics.rowsFailed[0].reason, /unparseable date/);
  assert.match(result.diagnostics.rowsFailed[1].reason, /unparseable amount/);
});

test("parseCsvStatement: external transaction ID column wins over synth", async () => {
  const csv = `Date,Amount,Description,TxId
2026-05-07,123.45,Coffee,TXN-001`;
  const result = await parseCsvStatement(csv, {
    date: "Date",
    amount: "Amount",
    description: "Description",
    externalTransactionId: "TxId",
  });
  assert.equal(result.rows[0].externalTransactionId, "TXN-001");
});

// ===========================================================================
// 5) OFX parser
// ===========================================================================

const OFX_2X_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>EUR</CURDEF>
        <BANKACCTFROM>
          <BANKID>0000</BANKID>
          <ACCTID>1234567</ACCTID>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260507</DTPOSTED>
            <TRNAMT>-12.50</TRNAMT>
            <FITID>FIT-001</FITID>
            <NAME>Coffee Shop</NAME>
            <MEMO>Bali</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260508</DTPOSTED>
            <TRNAMT>1500.00</TRNAMT>
            <FITID>FIT-002</FITID>
            <NAME>Salary</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

const OFX_1X_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260507
<TRNAMT>-12.50
<FITID>FIT-001
<NAME>Coffee Shop
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260508
<TRNAMT>1500.00
<FITID>FIT-002
<NAME>Salary
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

test("parseOfxStatement: OFX 2.x XML — extracts FITID + amount + currency + name", async () => {
  const result = await parseOfxStatement(OFX_2X_SAMPLE);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].externalTransactionId, "FIT-001");
  assert.equal(result.rows[0].amountMinor, -1250n);
  assert.equal(result.rows[0].currency, "EUR");
  assert.match(result.rows[0].description, /Coffee Shop/);
  assert.match(result.rows[0].description, /Bali/);
  assert.equal(result.rows[1].externalTransactionId, "FIT-002");
  assert.equal(result.rows[1].amountMinor, 150000n);
});

test("parseOfxStatement: OFX 1.x SGML — auto-closes unclosed tags + parses identically", async () => {
  const result = await parseOfxStatement(OFX_1X_SAMPLE);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].externalTransactionId, "FIT-001");
  assert.equal(result.rows[0].amountMinor, -1250n);
  assert.equal(result.rows[1].externalTransactionId, "FIT-002");
});

test("ofxSgmlToXml: closes unclosed value tags, leaves balanced tags alone", () => {
  const sgml = "<OFX>\n<TRNAMT>-12.50\n<TRNAMT>-99.99</TRNAMT>\n</OFX>";
  const xml = ofxSgmlToXml(sgml);
  assert.match(xml, /<TRNAMT>-12\.50<\/TRNAMT>/);
  assert.match(xml, /<TRNAMT>-99\.99<\/TRNAMT>/);
});

test("ofxSgmlToXml: strips SGML preamble before <OFX>", () => {
  const sgml =
    "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX>\n<X>1</X>\n</OFX>";
  const xml = ofxSgmlToXml(sgml);
  assert.equal(xml.startsWith("<OFX>"), true);
});

test("ofxDate: parses YYYYMMDD with optional time suffix", () => {
  assert.equal(
    ofxDate("20260507")?.toISOString().slice(0, 10),
    "2026-05-07",
  );
  assert.equal(
    ofxDate("20260507120000.000[0:GMT]")?.toISOString().slice(0, 10),
    "2026-05-07",
  );
  assert.equal(ofxDate(""), null);
  assert.equal(ofxDate("garbage"), null);
});

test("parseOfxStatement: empty content returns failed row", async () => {
  const result = await parseOfxStatement("");
  assert.equal(result.rows.length, 0);
  assert.match(result.diagnostics.rowsFailed[0].reason, /empty OFX/);
});

test("parseOfxStatement: credit-card statement (CCSTMTRS) parses", async () => {
  const cc = `<?xml version="1.0"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <CURDEF>USD</CURDEF>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260507</DTPOSTED>
            <TRNAMT>-99.99</TRNAMT>
            <FITID>CC-001</FITID>
            <NAME>Online purchase</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`;
  const result = await parseOfxStatement(cc);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].externalTransactionId, "CC-001");
  assert.equal(result.rows[0].currency, "USD");
});

// ===========================================================================
// 6) PDF parser
// ===========================================================================

test("listPdfTemplates: built-ins include Mandiri + BCA", () => {
  const ids = listPdfTemplates().map((t) => t.id);
  assert.ok(ids.includes("mandiri_v1"));
  assert.ok(ids.includes("bca_v1"));
});

test("getPdfTemplate: returns the template by id, undefined for unknown", () => {
  assert.ok(getPdfTemplate("mandiri_v1"));
  assert.equal(getPdfTemplate("not_a_template"), undefined);
});

test("parsePdfText: Mandiri sample — extracts transactions", () => {
  const text = `LAPORAN MUTASI REKENING
07/05/2026 SETOR TUNAI ATM 123456 1.000.000,00 5.000.000,00
08/05/2026 BIAYA ADM JANUARI 15.000,00 4.985.000,00
09/05/2026 TRANSFER VIA INTERNET BANKING 2.500.000,00 2.485.000,00`;
  const result = parsePdfText(text, "mandiri_v1");
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].amountMinor, 100000000n); // 1.000.000,00
  assert.equal(result.rows[0].currency, "IDR");
  assert.match(result.rows[0].description, /SETOR TUNAI/);
});

test("parsePdfText: BCA sample — uses DB/CR sign indicator", () => {
  // Note: real BCA exports often print dd/mm (no year) on transaction
  // lines; the year is in the statement header. The parser needs a
  // full date today — a year-imputation pass is on the P3.E todo so
  // operators can paste raw exports. For now we synthesize the full
  // date in the sample.
  const text = `KARTU REKENING BCA
07/05/2026 TRSF E-BANKING 1.500.000,00 DB
08/05/2026 SETORAN TUNAI 5.000.000,00 CR`;
  const result = parsePdfText(text, "bca_v1");
  assert.ok(result.rows.length >= 2);
  // Find a DB row — must come back negative.
  const dbRow = result.rows.find((r) => /TRSF/.test(r.description));
  assert.ok(dbRow);
  assert.ok(
    dbRow.amountMinor < 0n,
    `expected negative DB row, got ${dbRow.amountMinor}`,
  );
});

test("parsePdfText: unknown template surfaces a clean error", () => {
  const result = parsePdfText("anything", "not_a_template");
  assert.equal(result.rows.length, 0);
  assert.match(result.diagnostics.rowsFailed[0].reason, /unknown PDF template/);
});

test("parsePdfText: empty extracted text suggests OCR (deferred to P5)", () => {
  const result = parsePdfText("", "mandiri_v1");
  assert.equal(result.rows.length, 0);
  assert.match(result.diagnostics.rowsFailed[0].reason, /OCR/);
});

test("autoDetectPdfTemplate: returns mandiri for matching text", () => {
  const text = "07/05/2026 SETOR TUNAI 1.000.000,00 5.000.000,00";
  const template = autoDetectPdfTemplate(text);
  assert.ok(template);
  assert.equal(template.defaultCurrency, "IDR");
});

test("autoDetectPdfTemplate: returns null when no template matches", () => {
  assert.equal(autoDetectPdfTemplate("nothing useful here"), null);
});

test("registerPdfTemplate: operators can add custom templates", () => {
  registerPdfTemplate({
    id: "test_custom",
    label: "Test Custom Bank",
    defaultCurrency: "USD",
    rowRegex: /(?<date>\d{4}-\d{2}-\d{2})\s+(?<description>\S+)\s+(?<amount>-?\d+\.\d{2})/g,
  });
  const t = getPdfTemplate("test_custom");
  assert.ok(t);
  assert.equal(t.defaultCurrency, "USD");
  const result = parsePdfText("2026-05-07 Coffee 12.50", "test_custom");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].amountMinor, 1250n);
});

// ===========================================================================
// 7) MT940 parser
// ===========================================================================

const MT940_SAMPLE = `:20:STATEMENT-001
:25:DEUTDEFFXXX/12345678
:28C:00100/001
:60F:C260507EUR1000,00
:61:2605070507C1234,56NTRFNONREF//BANKREF1
:86:Salary payment from employer
:61:2605080508D50,00NMSCNONREF//BANKREF2
:86:Coffee shop bali
:62F:C260508EUR2184,56`;

test("parseMt940Statement: extracts 2 transactions with correct sign + value-date + currency", () => {
  const result = parseMt940Statement(MT940_SAMPLE);
  assert.equal(result.rows.length, 2);
  // Credit 1234,56 → +123456n
  assert.equal(result.rows[0].amountMinor, 123456n);
  assert.equal(result.rows[0].currency, "EUR");
  assert.equal(
    result.rows[0].transactionDate.toISOString().slice(0, 10),
    "2026-05-07",
  );
  assert.match(result.rows[0].description, /Salary/);
  // Debit 50,00 → -5000n
  assert.equal(result.rows[1].amountMinor, -5000n);
  assert.match(result.rows[1].description, /Coffee/i);
});

test("parseMt940Statement: bank reference (after //) used as externalTransactionId", () => {
  const result = parseMt940Statement(MT940_SAMPLE);
  assert.equal(result.rows[0].externalTransactionId, "BANKREF1");
  assert.equal(result.rows[1].externalTransactionId, "BANKREF2");
});

test("parseMt940Statement: period range from statement lines", () => {
  const result = parseMt940Statement(MT940_SAMPLE);
  assert.equal(
    result.diagnostics.periodStart!.toISOString().slice(0, 10),
    "2026-05-07",
  );
  assert.equal(
    result.diagnostics.periodEnd!.toISOString().slice(0, 10),
    "2026-05-08",
  );
});

test("parseMt940Statement: empty input returns single failure row", () => {
  const result = parseMt940Statement("");
  assert.equal(result.rows.length, 0);
  assert.equal(result.diagnostics.rowsFailed.length, 1);
});

test("parseStatementLine: parses :61: with value-date + entry-date + sign", () => {
  const out = parseStatementLine("2605070507C1234,56NTRFNONREF//BANKREF1");
  assert.ok(out);
  assert.equal(out.amountMinor, 123456n);
  assert.equal(out.valueDate.toISOString().slice(0, 10), "2026-05-07");
  assert.equal(out.entryDate?.toISOString().slice(0, 10), "2026-05-07");
  assert.equal(out.bankReference, "BANKREF1");
  assert.equal(out.customerReference, undefined); // NONREF dropped
});

test("parseStatementLine: debit sign yields negative amount", () => {
  const out = parseStatementLine("260508D50,00NMSCNONREF//REF2");
  assert.ok(out);
  assert.equal(out.amountMinor, -5000n);
});

test("parseStatementLine: customer reference (before //) preserved", () => {
  const out = parseStatementLine("260507C100,00NTRFINV-2026-001//BANK-X");
  assert.equal(out?.customerReference, "INV-2026-001");
  assert.equal(out?.bankReference, "BANK-X");
});

test("parseStatementLine: returns null on garbage", () => {
  assert.equal(parseStatementLine(""), null);
  assert.equal(parseStatementLine("not-a-statement-line"), null);
});

test("tokenizeTags: groups continuation lines under :86:", () => {
  const tags = tokenizeTags(":61:foo\n:86:line1\nline2\nline3\n:62F:bar");
  const tag86 = tags.find((t) => t.tag === "86");
  assert.ok(tag86);
  assert.match(tag86.body, /line1/);
  assert.match(tag86.body, /line2/);
  assert.match(tag86.body, /line3/);
});

test("tokenizeTags: handles tags with letter suffix (60F, 62F, 28C)", () => {
  const tags = tokenizeTags(
    ":20:REF\n:60F:C260507EUR1000,00\n:62F:C260508EUR1100,00\n:28C:001/001",
  );
  assert.equal(tags.length, 4);
  assert.equal(tags[1].tag, "60F");
  assert.equal(tags[2].tag, "62F");
  assert.equal(tags[3].tag, "28C");
});

// ===========================================================================
// 8) File-presence — public surface
// ===========================================================================

test("parsers public surface: imports succeed (smoke check)", () => {
  // If we got this far, all four parsers + helpers loaded without
  // throwing during import. The deeper parser-specific behavior is
  // tested above.
  assert.equal(typeof parseAmountToMinor, "function");
  assert.equal(typeof parseCsvStatement, "function");
  assert.equal(typeof parseOfxStatement, "function");
  assert.equal(typeof parsePdfText, "function");
  assert.equal(typeof parseMt940Statement, "function");
});
