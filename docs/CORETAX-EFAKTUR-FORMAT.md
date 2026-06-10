# Coretax e-Faktur import format — research findings

Date: 2026-06-10 · Researcher: Coretax export agent (wave 5)
Scope: upgrade the e-Faktur export on `/development-os/finance/tax-reports`
from "draft CSV" toward the official DJP Coretax import format.

## Verdict

**The official format is ESTABLISHED with HIGH confidence for output tax
invoices (faktur pajak keluaran).** The import format is **XML** (root element
`TaxInvoiceBulk`), produced either directly or via DJP's offline
Excel→XML converter. We verified it against three artifacts downloaded
directly from `pajak.go.id` (DJP's own domain) during this research session:

1. **Official sample XML** — `Sample Faktur PK Template v.1.4.xml`
   (from `https://pajak.go.id/sites/default/files/2025-03/Sample%20Faktur%20PK%20Template%20v.1.4.xml.zip`,
   page-dated 01/03/2025). Full element set reproduced below.
2. **Official Excel template v1.6.1** — `Sample Faktur PK Template v.1.6.1.xlsx`,
   shipped inside the official converter
   `https://pajak.go.id/sites/default/files/2026-01/ConverterEfakturCoretax__v1.6.zip`
   (page-dated 23/01/2026 — current as of this research). Its `Keterangan`
   sheet documents per-column mandatory/validation rules; its `REF-*` sheets
   are the authoritative enumerations (kode transaksi, unit codes, country
   codes, keterangan tambahan, cap fasilitas).
3. **Official upload-mechanism guide** — `Mekanisme Upload Faktur via XML.pdf`
   (`https://www.pajak.go.id/sites/default/files/2025-01/Mekanisme%20Upload%20Faktur%20via%20XML.pdf`):
   Excel template (`Faktur` + `DetailFaktur` sheets) → `Converter.Efaktur.Coretax`
   → XML → Coretax menu *e-Faktur → Faktur Keluaran → Impor Data* → XML
   Monitoring (`VALIDATING DATA` → `CREATING INVOICE FINISHED`) → bulk
   submit + digital signature (passphrase).

Implementation in this repo: `?format=coretax-xml` on
`/development-os/finance/tax-reports/export` (the draft CSV remains the
default, `?format=draft-csv`).

Confidence labels used below: **HIGH** = read directly from official DJP
artifacts; **MEDIUM** = consistent across ≥2 reputable secondary sources
(Ortax, DDTC, OnlinePajak, consultants) but not re-verified against a DJP
artifact; **LOW** = single secondary source or inference.

## 1. The XML schema (HIGH — official sample, verbatim structure)

```xml
<?xml version="1.0" encoding="utf-8"?>
<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">
  <TIN>1091031210912281</TIN>                  <!-- seller NPWP, 16 digits -->
  <ListOfTaxInvoice>
    <TaxInvoice>
      <TaxInvoiceDate>2025-02-02</TaxInvoiceDate>  <!-- YYYY-MM-DD in XML -->
      <TaxInvoiceOpt>Normal</TaxInvoiceOpt>        <!-- always "Normal" for import -->
      <TrxCode>07</TrxCode>                        <!-- kode transaksi 01–10 -->
      <AddInfo>TD.00502</AddInfo>                  <!-- required only for TrxCode 07/08 -->
      <CustomDoc>0000409...000270</CustomDoc>      <!-- supporting doc no., optional -->
      <CustomDocMonthYear>122024</CustomDocMonthYear> <!-- MMYYYY, optional -->
      <RefDesc/>                                   <!-- free-form reference, optional -->
      <FacilityStamp>TD.01102</FacilityStamp>      <!-- required only for TrxCode 07/08 -->
      <SellerIDTKU>1091031210912281000000</SellerIDTKU> <!-- 22-digit NITKU -->
      <BuyerTin>1091031210912281</BuyerTin>        <!-- 16 digits; 0000000000000000 if non-TIN -->
      <BuyerDocument>TIN</BuyerDocument>           <!-- TIN | National ID | Passport | Other ID -->
      <BuyerCountry>IND</BuyerCountry>             <!-- see country-code trap below -->
      <BuyerDocumentNumber/>                       <!-- "-" when BuyerDocument = TIN -->
      <BuyerName/>
      <BuyerAdress/>                               <!-- sic — misspelled in the official schema -->
      <BuyerEmail>someemail@gmail.com</BuyerEmail> <!-- optional -->
      <BuyerIDTKU>1091031210912281000000</BuyerIDTKU> <!-- 22-digit; "000000" if non-TIN -->
      <ListOfGoodService>
        <GoodService>
          <Opt>A</Opt>                 <!-- A = goods (Barang), B = services (Jasa) -->
          <Code>000000</Code>          <!-- goods/services code; 000000 generic -->
          <Name>Barang</Name>
          <Unit>UM.0001</Unit>         <!-- unit code, REF list UM.0001–UM.0039 -->
          <Price>15000</Price>
          <Qty>200</Qty>
          <TotalDiscount>100000</TotalDiscount>
          <TaxBase>2900000</TaxBase>             <!-- DPP -->
          <OtherTaxBase>2900000</OtherTaxBase>   <!-- DPP Nilai Lain -->
          <VATRate>11</VATRate>                  <!-- current regime: 12, see §4 -->
          <VAT>319000</VAT>
          <STLGRate>20</STLGRate>                <!-- PPnBM rate, 0 if none -->
          <STLG>580000</STLG>                    <!-- PPnBM amount, 0 if none -->
        </GoodService>
      </ListOfGoodService>
    </TaxInvoice>
  </ListOfTaxInvoice>
</TaxInvoiceBulk>
```

One `TaxInvoice` per invoice; one `GoodService` per line item. Multiple
invoices per file (bulk).

**Country-code trap (HIGH):** the official v1.4 sample XML shows
`<BuyerCountry>IND</BuyerCountry>`, but per the template's own
`REF-KodeNegara` sheet **`IND` is India — Indonesia is `IDN`** (ISO
3166-1 alpha-3). The Excel template's sample rows use `IDN`. We emit `IDN`.

## 2. Excel template v1.6.1 column sets (HIGH — official template)

Sheet `Faktur` (one row per invoice; first row holds `NPWP Penjual` =
seller's 16-digit NPWP; data terminated by a literal `END` row):

`Baris` · `Tanggal Faktur` (DD/MM/YYYY in Excel; the converter emits
YYYY-MM-DD) · `Jenis Faktur` (always `Normal`) · `Kode Transaksi` ·
`Keterangan Tambahan` · `Dokumen Pendukung` · `Period Dok Pendukung`
(MMYYYY) · `Referensi` · `Cap Fasilitas` · `ID TKU Penjual` (22 digits) ·
`NPWP/NIK Pembeli` (16 digits; `0000000000000000` when non-TIN) ·
`Jenis ID Pembeli` (`TIN`/`National ID`/`Passport`/`Other ID`) ·
`Negara Pembeli` (`IDN` …) · `Nomor Dokumen Pembeli` (`-` when TIN) ·
`Nama Pembeli` · `Alamat Pembeli` · `Email Pembeli` · `ID TKU Pembeli`.

Sheet `DetailFaktur` (one row per line item, joined to `Faktur` by `Baris`):

`Baris` · `Barang/Jasa` (A/B) · `Kode Barang Jasa` · `Nama Barang/Jasa` ·
`Nama Satuan Ukur` (UM.xxxx) · `Harga Satuan` · `Jumlah Barang Jasa` ·
`Total Diskon` · `DPP` · `DPP Nilai Lain` · `Tarif PPN` · `PPN` ·
`Tarif PPnBM` · `PPnBM`.

Per-field rules from the template's `Keterangan` sheet (HIGH):

| Field | Mandatory | DJP-validated | Rule |
|---|---|---|---|
| Tanggal Faktur | yes | no | DD/MM/YYYY (Excel) |
| Jenis Faktur | yes | no | always `Normal` |
| Kode Transaksi | yes | yes | per reference list (01–10) |
| Keterangan Tambahan / Cap Fasilitas | conditional | yes | required for TrxCode 07/08 |
| ID TKU Penjual | yes | yes | 22-digit NITKU |
| NPWP/NIK Pembeli | yes | yes | `0000000000000000` when Jenis ID ≠ TIN |
| Nomor Dokumen Pembeli | yes | yes | `-` when Jenis ID = TIN |
| Nama / Alamat Pembeli | yes | yes | for TIN buyers Coretax overwrites with prepopulated registry data |
| ID TKU Pembeli | yes | yes | 22 digits for TIN buyers; `000000` otherwise |
| Harga Satuan / Jumlah / Diskon / DPP / DPP Nilai Lain | yes | no | max 2 decimals, commercial rounding (half-up); discount 0 if none |
| DPP Nilai Lain | yes | no | **set equal to DPP when not using nilai lain** |
| Tarif PPN | yes | yes | the statutory rate in force |
| PPN | yes | no | **must equal Tarif PPN × DPP Nilai Lain for TrxCode 01, 04, 09**; may differ for other codes |
| Tarif PPnBM / PPnBM | yes | no | 0 when no PPnBM |

Kode transaksi reference (HIGH, from `REF-General`): 01 non-collector
buyers · 02 government VAT collectors · 03 other VAT collectors ·
04 DPP Nilai Lain · 05 besaran tertentu · 06 foreign-passport individuals
(16E) · 07 VAT-not-collected facility · 08 VAT-exempt facility ·
09 art. 16D asset disposals · 10 other supplies.

## 3. Invoice numbering (HIGH)

**There is no invoice-number field anywhere in the import template.** The
nomor faktur pajak is assigned by Coretax/DJP after upload: imported rows
enter the Faktur Keluaran grid with status `CREATED`, and become numbered,
valid tax invoices only after bulk submit + digital signature inside
Coretax (per the official upload-mechanism PDF). Our export therefore
**never emits or invents an invoice number** — there is no field to fill.

## 4. Current rate regime — VATRate / OtherTaxBase (MEDIUM-HIGH)

Per PMK 131/2024 (in force since 1 Jan 2025) and PER-1/PJ/2025:

* Statutory rate is **12%**.
* **Non-luxury** goods/services: tax base is **DPP Nilai Lain = 11/12 ×**
  the selling price, with **TrxCode 04**, so the effective burden stays 11%.
  → `TaxBase` = full price, `OtherTaxBase` = 11/12 × price (2-dp commercial
  rounding), `VATRate` = 12, `VAT` = 12% × OtherTaxBase.
* **Luxury** goods (PPnBM-subject, e.g. residences above the PMK 15/2023
  threshold): full DPP × 12%, TrxCode 01, plus PPnBM fields.

The official v1.6.1 template's sample rows match this exactly
(DPP 120,000,000 → DPP Nilai Lain 110,000,000 → Tarif 12 → PPN 13,200,000,
TrxCode 04). The v1.4 *XML* sample predates this and still shows
`VATRate 11` — follow the v1.6.1 convention.
Sources: official template sample rows (HIGH); Ortax
"Membuat Faktur Pajak DPP Nilai Lain pada Aplikasi Coretax", DDTC, ISB
Consultant articles (MEDIUM).

## 5. NPWP 16-digit handling (MEDIUM-HIGH)

* All NPWP fields are 16-digit (Coretax-era format, PMK 112/PMK.03/2022):
  individuals use NIK; **legacy 15-digit NPWP becomes 16-digit by
  prefixing one `0`** (official conversion rule).
* NITKU / ID TKU = 16-digit NPWP + 6-digit branch suffix; **head office =
  `000000`** (so 22 digits total).
* Buyers without NPWP: `NPWP/NIK Pembeli = 0000000000000000`, Jenis ID =
  `National ID`/`Passport`/`Other ID` with the actual document number, and
  `ID TKU Pembeli = 000000`.

## 6. e-Bupot (bukti potong) import format (MEDIUM — found, not implemented)

The same official DJP page
(`https://www.pajak.go.id/reformdjp/coretax/template-xml-dan-converter-excel-ke-xml`,
English mirror `https://www.pajak.go.id/en/node/112031`) publishes
Excel→XML templates per bukti-potong type, consumed by the same converter:
**BPPU** (bukti potong PPh unifikasi — what our withholding register would
feed), **BP21** (PPh 21 non-employee, v.4 17/04/2025), **BPMP** (employee
monthly, v.3 17/04/2025), **BP26**, **BPA1**, **BPA2**, **BPNR**, **BPSP**,
**BPCY**, **DDBU**. Validation (per the converter user manual): NPWP
pemotong, NITKU of both parties, kode objek pajak, tarif. We did **not**
download/inspect the BPPU template this session, so its exact column set is
unconfirmed — left for a follow-up; the bukti-potong register keeps its
printable-draft export only.

## 7. Mapping: our data → Coretax XML (what `?format=coretax-xml` emits)

Scope: **output invoices (PPN Keluaran) only** — the import menu is
*Faktur Keluaran*. Input VAT (Masukan) is prepopulated inside Coretax from
sellers' uploaded invoices and is not created by import (returns have a
separate `Retur Faktur PM` template). Input lines remain in the draft CSV.

Currency policy: Coretax amounts are IDR. We export **original-currency
amounts for IDR-denominated transactions only** (`amount_minor / 100`,
stored ×100 per repo convention) and **exclude non-IDR lines** from the
official file — they stay in the draft CSV. The excluded count is shown in
the UI and in the file's header comment.

| Coretax field | Our source | Note |
|---|---|---|
| TIN / SellerIDTKU | — | **No org-level NPWP exists in our schema.** Emitted EMPTY; operator must fill the 16-digit NPWP (+ `000000` branch suffix for the IDTKU) before upload. Never invented. |
| TaxInvoiceDate | `dev_transactions.transaction_date` | already YYYY-MM-DD |
| TaxInvoiceOpt | constant `Normal` | per template rule |
| TrxCode | constant `04` (DEFAULT — review) | We do not classify supplies. 04 = the standard non-luxury code under PMK 131/2024. Luxury supplies (PPnBM) must be re-coded 01 by the operator. Flagged in the file's review notes. |
| AddInfo / CustomDoc / CustomDocMonthYear / FacilityStamp | — | empty (only required for TrxCode 07/08, which we never emit) |
| RefDesc | `dev_transactions.transaction_code` | our internal reference, honest free-form use |
| BuyerTin | vendor register `tax_id` matched by counterparty name | digits only; 15-digit → `0`-prefixed (official rule); 16-digit verbatim; anything else → non-TIN path + review note |
| BuyerDocument / BuyerDocumentNumber | derived | TIN → `TIN` / `-`; no usable NPWP → `Other ID` / EMPTY (operator must fill; we hold no identity documents) |
| BuyerCountry | constant `IDN` | REF sheet (NOT `IND` = India) |
| BuyerName / BuyerAdress | `counterparty_name` / vendor register `address` | for TIN buyers Coretax overwrites from its registry (prepop) |
| BuyerEmail | — | empty (optional) |
| BuyerIDTKU | BuyerTin + `000000` | head-office suffix ASSUMPTION — review if the buyer transacts via a branch; `000000` alone when non-TIN |
| Opt (Barang/Jasa) | constant `A` (DEFAULT — review) | not recorded in our data; flagged per file |
| Code / Name / Unit | `000000` / transaction `description` / `UM.0033` (Lainnya) | generic code + our description; unit not recorded |
| Price / Qty / TotalDiscount | DPP / `1` / `0` | we record totals, not line items; identity DPP = Price×Qty−Discount holds |
| TaxBase (DPP) | `amount_minor / 100` (IDR) | recorded original-currency amount. If `is_tax_included` is true the recorded amount is gross — flagged in review notes (same caveat as the declaration aggregates) |
| OtherTaxBase | computed: round2(DPP × 11/12) | statutory arithmetic for TrxCode 04 (PMK 131/2024) |
| VATRate | constant `12` | current statutory rate |
| VAT | computed: round2(OtherTaxBase × 12%) | the template REQUIRES PPN = Tarif × DPP Nilai Lain for TrxCode 04, so this is arithmetic, not data. Our recorded `tax_amount_minor` is USD-normalised (declaration convention) and cannot be exported as IDR verbatim; it stays in the draft CSV. |
| STLGRate / STLG | constants `0` / `0` | PPnBM not tracked; review for luxury supplies |
| nomor faktur | — | does not exist in the template; DJP-issued after upload (§3) |

Negative-amount lines (credit notes) are exported as-is but flagged in the
review notes — Coretax expects returns via the separate Retur template.

## 8. Residual gaps / follow-ups

1. Seller NPWP: add an org-level (or legal-entity-level) NPWP field so
   `TIN`/`SellerIDTKU` can be filled automatically.
2. Per-transaction supply classification (goods vs services, luxury vs
   non-luxury, kode transaksi) if operators want zero-touch uploads.
3. BPPU (e-Bupot unifikasi) template inspection + export for the
   withholding register.
4. The XSD itself (`TaxInvoice.xsd`) is referenced by the sample but not
   distributed in the converter zip; validation rules above come from the
   template's `Keterangan` sheet + observed Coretax behaviour in sources.

## Sources

* DJP — Template XML dan Converter Excel ke XML (download hub):
  https://www.pajak.go.id/en/node/112031 /
  https://www.pajak.go.id/reformdjp/coretax/template-xml-dan-converter-excel-ke-xml
* DJP — official converter v1.6 (zip incl. Excel template v1.6.1 +
  sample XMLs + release notes), downloaded + inspected 2026-06-10:
  https://pajak.go.id/sites/default/files/2026-01/ConverterEfakturCoretax__v1.6.zip
* DJP — official sample output-invoice XML v1.4, downloaded + inspected:
  https://pajak.go.id/sites/default/files/2025-03/Sample%20Faktur%20PK%20Template%20v.1.4.xml.zip
* DJP — Mekanisme Upload Faktur via XML (PDF, 2025-01), downloaded + read:
  https://www.pajak.go.id/sites/default/files/2025-01/Mekanisme%20Upload%20Faktur%20via%20XML.pdf
* Ortax — Cara Membuat File XML untuk Impor Data di Coretax:
  https://ortax.org/cara-membuat-file-xml-untuk-impor-data-di-coretax
* Ortax — Membuat Faktur Pajak DPP Nilai Lain pada Aplikasi Coretax:
  https://ortax.org/membuat-faktur-pajak-dpp-nilai-lain-pada-aplikasi-coretax
* Ortax — Menentukan Kode Transaksi Faktur Pajak Era Coretax:
  https://ortax.org/menentukan-kode-transaksi-faktur-pajak-era-coretax
* DDTC News — template updates (TD.00513/TD.00524, v1.6 units):
  https://news.ddtc.co.id/berita/nasional/1813944/perhatian-ada-update-template-excel-faktur-pajak-keluaran
* OnlinePajak — Tutorial Impor Faktur Pajak via Format XML di Coretax:
  https://www.online-pajak.com/tips-ppn-efaktur/impor-faktur-pajak-pada-aplikasi-coretax/
* ISB Consultant — Cara Impor Faktur Pajak Format XML di Coretax:
  https://isbconsultant.com/cara-impor-faktur-pajak-format-xml-di-coretax/
