import qrCodeGenerator from "qrcode-generator";

import {
  formatInvoiceAmount,
  formatInvoiceDuration,
  formatInvoicePeriod,
  parsePayoutSnapshot,
} from "./invoiceFormatters";

function escapeHtml(rawValue) {
  return String(rawValue ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildIssuerMarkup(businessConfig, documentTranslations) {
  const businessName = businessConfig?.businessName || documentTranslations.businessFallbackName;
  const issuerRows = [
    businessConfig?.businessAddress,
    businessConfig?.businessPhone,
    businessConfig?.businessEmail,
    businessConfig?.businessTaxId,
  ].filter(Boolean);

  return `
    <section style="align-items:flex-start;display:flex;gap:18px;">
      ${businessConfig?.businessLogoUrl ? `<img src="${escapeHtml(businessConfig.businessLogoUrl)}" alt="" style="max-height:72px;max-width:150px;object-fit:contain;">` : ""}
      <div style="min-width:0;">
        <h2 style="color:#14532d;font-size:20px;margin:0 0 8px;">${escapeHtml(businessName)}</h2>
        ${issuerRows.map((issuerRow) => `<p style="color:#4b5563;font-size:12px;margin:2px 0;">${escapeHtml(issuerRow)}</p>`).join("")}
      </div>
    </section>
  `;
}

function buildLineItemsMarkup(invoice, documentTranslations) {
  return (invoice?.lineItems ?? []).map((lineItem) => `
    <tr>
      <td style="border-bottom:1px solid #e5e7eb;padding:12px 14px;vertical-align:top;">
        <strong style="color:#111827;">${escapeHtml(lineItem.projectName)}</strong>
        <span style="color:#6b7280;display:block;font-size:12px;margin-top:2px;">${escapeHtml(lineItem.taskName)}</span>
      </td>
      <td style="border-bottom:1px solid #e5e7eb;padding:12px 14px;vertical-align:top;white-space:nowrap;">${escapeHtml(formatInvoiceDuration(lineItem.quantityMinutes))}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:12px 14px;vertical-align:top;white-space:nowrap;">${escapeHtml(formatInvoiceAmount(lineItem.rateCents, invoice?.currencyAcronym))}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:12px 14px;text-align:right;vertical-align:top;white-space:nowrap;">${escapeHtml(formatInvoiceAmount(lineItem.amountCents, invoice?.currencyAcronym))}</td>
    </tr>
  `).join("") || `
    <tr>
      <td colspan="4" style="border-bottom:1px solid #e5e7eb;color:#6b7280;padding:18px;text-align:center;">${escapeHtml(documentTranslations.noLineItems)}</td>
    </tr>
  `;
}

function buildBankInstructionsMarkup(invoice, documentTranslations) {
  const payoutSnapshot = parsePayoutSnapshot(invoice?.payoutSnapshot);
  if (!payoutSnapshot) return "";

  const payoutRows = [
    [documentTranslations.accountHolder, payoutSnapshot.accountHolder],
    [documentTranslations.bankName, payoutSnapshot.bankName],
    [documentTranslations.accountNumber, payoutSnapshot.accountNumber],
    [documentTranslations.clabe, payoutSnapshot.clabe],
    [documentTranslations.swift, payoutSnapshot.swift],
    [documentTranslations.iban, payoutSnapshot.iban],
  ].filter(([, payoutValue]) => payoutValue);

  return `
    <section style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;">
      <h2 style="color:#14532d;font-size:18px;margin:0 0 12px;">${escapeHtml(documentTranslations.bankDetails)}</h2>
      <dl style="display:grid;gap:12px 18px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;">
        ${payoutRows.map(([payoutLabel, payoutValue]) => `
          <div>
            <dt style="color:#6b7280;font-size:12px;">${escapeHtml(payoutLabel)}</dt>
            <dd style="color:#111827;font-weight:700;margin:2px 0 0;overflow-wrap:anywhere;">${escapeHtml(payoutValue)}</dd>
          </div>
        `).join("")}
      </dl>
    </section>
  `;
}

function buildLightningQrCodeMarkup(lightningInvoice) {
  try {
    const lightningInvoiceQrCode = qrCodeGenerator(0, "M");
    lightningInvoiceQrCode.addData(lightningInvoice);
    lightningInvoiceQrCode.make();
    const lightningInvoiceQrCodeSvg = lightningInvoiceQrCode.createSvgTag({
      cellSize: 4,
      margin: 2,
      scalable: true,
    });

    return `
      <div style="background:#ffffff;border:1px solid #d1d5db;border-radius:12px;box-sizing:border-box;flex:0 0 184px;padding:12px;width:184px;">
        ${lightningInvoiceQrCodeSvg.replace(
          "<svg ",
          '<svg aria-label="Lightning invoice QR code" role="img" style="display:block;height:160px;width:160px;" ',
        )}
      </div>
    `;
  } catch {
    return "";
  }
}

function buildLightningInstructionsMarkup(invoice, documentTranslations) {
  if (!invoice?.bolt11) return "";

  return `
    <section style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;">
      <h2 style="color:#14532d;font-size:18px;margin:0 0 12px;">${escapeHtml(documentTranslations.lightningDetails)}</h2>
      <div style="align-items:flex-start;display:flex;gap:18px;">
        ${buildLightningQrCodeMarkup(invoice.bolt11)}
        <div style="min-width:0;">
          <div style="color:#14532d;font-size:13px;font-weight:700;margin-bottom:8px;">${escapeHtml(formatInvoiceAmount(invoice?.totalCents, invoice?.currencyAcronym))}</div>
          <p style="background:#ffffff;border:1px solid #d1d5db;border-radius:8px;box-sizing:border-box;font-family:monospace;font-size:11px;line-height:1.5;margin:0;min-width:0;overflow-wrap:anywhere;padding:10px;white-space:normal;word-break:break-word;">${escapeHtml(invoice.bolt11)}</p>
        </div>
      </div>
    </section>
  `;
}

function buildPaymentInstructionsMarkup(invoice, documentTranslations) {
  if (invoice?.paymentMethod === "bank") {
    return buildBankInstructionsMarkup(invoice, documentTranslations);
  }

  if (invoice?.paymentMethod === "lightning") {
    return buildLightningInstructionsMarkup(invoice, documentTranslations);
  }

  return "";
}

export function buildFreelanceInvoiceHtmlDocument({ invoice, businessConfig, documentTranslations }) {
  const invoiceTotal = formatInvoiceAmount(invoice?.totalCents, invoice?.currencyAcronym);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(invoice?.invoiceNumber || documentTranslations.invoiceTitle)}</title>
  </head>
  <body style="background:#f9fafb;box-sizing:border-box;color:#172016;font-family:Arial,sans-serif;line-height:1.4;margin:0;padding:34px;">
    <main style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;box-sizing:border-box;margin:0 auto;max-width:880px;padding:34px;">
      <header style="align-items:flex-start;border-bottom:2px solid #166534;display:flex;gap:24px;justify-content:space-between;padding-bottom:26px;">
        ${buildIssuerMarkup(businessConfig, documentTranslations)}
        <div style="min-width:210px;text-align:right;">
          <h1 style="color:#14532d;font-size:32px;margin:0;">${escapeHtml(documentTranslations.invoiceTitle)}</h1>
          <p style="color:#374151;font-size:14px;font-weight:700;margin:8px 0 0;">${escapeHtml(invoice?.invoiceNumber)}</p>
          <p style="color:#14532d;font-size:24px;font-weight:700;margin:16px 0 0;">${escapeHtml(invoiceTotal)}</p>
        </div>
      </header>
      <section style="display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr));margin:28px 0;">
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
          <span style="color:#6b7280;display:block;font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;">${escapeHtml(documentTranslations.client)}</span>
          <span style="color:#111827;font-size:14px;font-weight:700;overflow-wrap:anywhere;">${escapeHtml(invoice?.clientName)}</span>
        </div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
          <span style="color:#6b7280;display:block;font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;">${escapeHtml(documentTranslations.period)}</span>
          <span style="color:#111827;font-size:14px;font-weight:700;">${escapeHtml(formatInvoicePeriod(invoice))}</span>
        </div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
          <span style="color:#6b7280;display:block;font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;">${escapeHtml(documentTranslations.status)}</span>
          <span style="color:#111827;font-size:14px;font-weight:700;">${escapeHtml(documentTranslations.statusLabel)}</span>
        </div>
        <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:right;">
          <span style="color:#166534;display:block;font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;">${escapeHtml(documentTranslations.total)}</span>
          <span style="color:#14532d;font-size:16px;font-weight:700;">${escapeHtml(invoiceTotal)}</span>
        </div>
      </section>
      <section>
        <h2 style="color:#14532d;font-size:18px;margin:0 0 12px;">${escapeHtml(documentTranslations.lineItems)}</h2>
        <table style="border:1px solid #e5e7eb;border-collapse:separate;border-radius:10px;border-spacing:0;margin-top:10px;overflow:hidden;width:100%;">
          <thead>
            <tr>
              <th style="background:#f3f4f6;color:#374151;font-size:12px;padding:12px 14px;text-align:left;">${escapeHtml(documentTranslations.lineItem)}</th>
              <th style="background:#f3f4f6;color:#374151;font-size:12px;padding:12px 14px;text-align:left;">${escapeHtml(documentTranslations.duration)}</th>
              <th style="background:#f3f4f6;color:#374151;font-size:12px;padding:12px 14px;text-align:left;">${escapeHtml(documentTranslations.rate)}</th>
              <th style="background:#f3f4f6;color:#374151;font-size:12px;padding:12px 14px;text-align:right;">${escapeHtml(documentTranslations.amount)}</th>
            </tr>
          </thead>
          <tbody>
            ${buildLineItemsMarkup(invoice, documentTranslations)}
          </tbody>
        </table>
        <div style="align-items:center;display:flex;font-size:20px;font-weight:700;gap:18px;justify-content:flex-end;margin:20px 0 30px;">
          <span style="color:#6b7280;font-size:13px;text-transform:uppercase;">${escapeHtml(documentTranslations.total)}</span>
          <span style="color:#14532d;">${escapeHtml(invoiceTotal)}</span>
        </div>
      </section>
      ${buildPaymentInstructionsMarkup(invoice, documentTranslations)}
    </main>
  </body>
</html>`;
}
