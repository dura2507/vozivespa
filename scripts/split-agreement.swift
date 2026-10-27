// Splits Thomas' multilingual rental agreement (public/docs/sickmotos-rental-agreement.pdf:
// cover page, then 2 pages per language) into one PDF per site language, so every
// link can hand out the visitor's own language. macOS only (PDFKit).
//
// When Thomas sends a new version: replace the multilingual PDF, then run
//   swift scripts/split-agreement.swift
// It refuses to write anything if a page does not carry the expected language code.
import Foundation
import PDFKit

let dir = "public/docs"
let source = "\(dir)/sickmotos-rental-agreement.pdf"
// Site locale -> language code printed in the PDF page header (Czech is "CZ" there).
let languages: [(locale: String, code: String)] = [
  ("en", "EN"), ("de", "DE"), ("hr", "HR"), ("it", "IT"), ("pl", "PL"), ("fr", "FR"),
  ("es", "ES"), ("hu", "HU"), ("sk", "SK"), ("cs", "CZ"), ("pt", "PT"),
]
let pagesPerLanguage = 2

guard let doc = PDFDocument(url: URL(fileURLWithPath: source)) else {
  fatalError("cannot open \(source)")
}
let expected = 1 + languages.count * pagesPerLanguage
guard doc.pageCount == expected else {
  fatalError("\(source) has \(doc.pageCount) pages, expected \(expected)")
}

var parts: [(String, PDFDocument)] = []
for (i, lang) in languages.enumerated() {
  let out = PDFDocument()
  for p in 0..<pagesPerLanguage {
    let index = 1 + i * pagesPerLanguage + p
    guard let page = doc.page(at: index) else { fatalError("missing page \(index + 1)") }
    // Page header, e.g. "SICKMOTOS RENTAL 🇩🇪 DE MIETVERTRAG ..." (sometimes wrapped).
    let head = String((page.string ?? "").prefix(40))
      .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    // The code must be the token right after the flag: " DE " alone would also
    // match the French/Spanish/Portuguese titles ("CONTRAT DE LOCATION").
    let tokens = head.split(separator: " ").map(String.init)
    guard head.hasPrefix("SICKMOTOS RENTAL"), tokens.count > 3, tokens[3] == lang.code else {
      fatalError("page \(index + 1) should be \(lang.code), header is: \(head)")
    }
    guard let copy = page.copy() as? PDFPage else { fatalError("cannot copy page \(index + 1)") }
    out.insert(copy, at: out.pageCount)
  }
  parts.append(("\(dir)/sickmotos-rental-agreement-\(lang.locale).pdf", out))
}
for (path, out) in parts {
  guard out.write(to: URL(fileURLWithPath: path)) else { fatalError("cannot write \(path)") }
  print("wrote \(path) (\(out.pageCount) pages)")
}
