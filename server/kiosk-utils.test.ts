import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import type { KioskTemplateField } from "@shared/schema";
import { fieldsFromPdf, fillKioskPdf, inspectKioskPdf, nextScheduledDueDate, pdfBindingsMatch, validateKioskAnswers } from "./kiosk-utils";

test("PDF checkbox bindings compare by value regardless of JSON key order", () => {
  assert.equal(
    pdfBindingsMatch(
      [{ option: "Yes", onValue: "Yes", fieldName: "check.yes" }],
      [{ fieldName: "check.yes", option: "Yes", onValue: "Yes" }],
    ),
    true,
  );
  assert.equal(
    pdfBindingsMatch(
      [{ option: "Yes", onValue: "Yes", fieldName: "check.yes" }],
      [{ fieldName: "check.no", option: "Yes", onValue: "Yes" }],
    ),
    false,
  );
});

test("required answers and select options are validated", () => {
  const fields: KioskTemplateField[] = [
    { name: "inspector", label: "Inspector", type: "text", multiline: false, required: true, source: "answer", options: [] },
    { name: "condition", label: "Condition", type: "dropdown", multiline: false, required: true, source: "answer", options: ["Good", "Repair"] },
    { name: "safe", label: "Safe to use", type: "checkbox", multiline: false, required: true, source: "answer", options: [] },
  ];

  assert.equal(validateKioskAnswers(fields, { inspector: " ", condition: "Good", safe: true }), "Inspector is required");
  assert.equal(validateKioskAnswers(fields, { inspector: "Taylor", condition: "Unknown", safe: true }), "Condition has an invalid selection");
  assert.equal(validateKioskAnswers(fields, { inspector: "Taylor", condition: "Good", safe: true }), undefined);
  assert.match(validateKioskAnswers(fields, { inspector: "Taylor", condition: "Good", safe: false }) ?? "", /Safe to use is required/);
});

test("fill detection and filling preserve supported PDF values and signoffs", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage();
  const form = source.getForm();
  form.createTextField("technician").addToPage(page, { x: 30, y: 700, width: 150, height: 20 });
  form.createCheckBox("safe").addToPage(page, { x: 30, y: 660, width: 15, height: 15 });
  const condition = form.createDropdown("condition");
  condition.addOptions(["Good", "Repair"]);
  condition.addToPage(page, { x: 30, y: 620, width: 150, height: 20 });
  const input = await source.save();
  const discovered = fieldsFromPdf(await PDFDocument.load(input));
  assert.deepEqual(discovered.map((field) => field.type), ["text", "checkbox", "dropdown"]);

  const fields = discovered.map((field) => ({
    ...field,
    source: field.name === "technician" ? "technician_name" as const : "answer" as const,
  }));
  const filled = await fillKioskPdf(Buffer.from(input), fields, { safe: true, condition: "Good" }, {
    technicianName: "Taylor",
    workOrder: "WO-42",
    submittedAt: new Date("2026-04-24T12:00:00Z"),
  });
  const result = (await PDFDocument.load(filled)).getForm();
  assert.equal(result.getTextField("technician").getText(), "Taylor");
  assert.equal(result.getCheckBox("safe").isChecked(), true);
  assert.deepEqual(result.getDropdown("condition").getSelected(), ["Good"]);
});

test("searchable inspection prompts and revisions map to paired Yes/No PDF checkboxes", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage();
  const font = await source.embedFont(StandardFonts.Helvetica);
  page.drawText("Question A", { x: 30, y: 300, font });
  page.drawText("Question B", { x: 90, y: 300, font });
  page.drawText("PV-E0910 Ver. 3", { x: 400, y: 20, font });

  const form = source.getForm();
  const paired = form.createCheckBox("paired-question");
  paired.addToPage(page, { x: 30, y: 600, width: 15, height: 15 });
  paired.addToPage(page, { x: 30, y: 560, width: 15, height: 15 });
  const pairedWidgets = paired.acroField.getWidgets();
  const pairedNoAppearance = pairedWidgets[1].getAppearances()?.normal;
  assert.ok(pairedNoAppearance instanceof PDFDict);
  const pairedAppearance = pairedNoAppearance.lookup(PDFName.of("Yes"));
  assert.ok(pairedAppearance);
  pairedNoAppearance.delete(PDFName.of("Yes"));
  pairedNoAppearance.set(PDFName.of("No"), pairedAppearance);

  const separateYes = form.createCheckBox("separate-yes");
  separateYes.addToPage(page, { x: 90, y: 600, width: 15, height: 15 });
  const separateNo = form.createCheckBox("separate-no");
  separateNo.addToPage(page, { x: 90, y: 560, width: 15, height: 15 });
  const separateNoWidget = separateNo.acroField.getWidgets()[0];
  const separateNoAppearance = separateNoWidget.getAppearances()?.normal;
  assert.ok(separateNoAppearance instanceof PDFDict);
  const separateAppearance = separateNoAppearance.lookup(PDFName.of("Yes"));
  assert.ok(separateAppearance);
  separateNoAppearance.delete(PDFName.of("Yes"));
  separateNoAppearance.set(PDFName.of("No"), separateAppearance);

  const input = await source.save();
  const detected = await inspectKioskPdf(await PDFDocument.load(input), input);
  const choices = detected.fields.filter((field) => field.type === "radio");
  assert.equal(detected.revision, "3");
  assert.deepEqual(choices.map((field) => field.label), ["Question A", "Question B"]);
  assert.ok(choices.every((field) => field.required && field.options.join(",") === "Yes,No"));
  assert.match(validateKioskAnswers(choices, {}) ?? "", /Question A is required/);

  const answers = Object.fromEntries(choices.map((field) => [field.name, "No"]));
  const filled = await fillKioskPdf(input, detected.fields, answers, {
    technicianName: "Taylor",
    workOrder: "",
    submittedAt: new Date("2026-11-18T12:00:00Z"),
  });
  const filledForm = (await PDFDocument.load(filled)).getForm();
  for (const field of choices) {
    const selected = field.pdfBindings.find((binding) => binding.option === "No");
    assert.ok(selected);
    const selectedCheckbox = filledForm.getCheckBox(selected.fieldName);
    assert.equal(selectedCheckbox.acroField.getValue()?.decodeText(), selected.onValue);
    const activeStates = selectedCheckbox.acroField.getWidgets()
      .map((widget) => widget.getAppearanceState()?.decodeText())
      .filter((state) => state && state !== "Off");
    assert.deepEqual(activeStates, [selected.onValue]);
    for (const binding of field.pdfBindings.filter((candidate) => candidate.fieldName !== selected.fieldName)) {
      const checkbox = filledForm.getCheckBox(binding.fieldName);
      assert.equal(checkbox.acroField.getValue()?.decodeText(), "Off");
    }
  }
});

test("monthly inspection dates keep the original calendar anchor", () => {
  const januaryEnd = new Date(Date.UTC(2026, 0, 31));
  const nextDue = nextScheduledDueDate(
    januaryEnd,
    null,
    1,
    "month",
    new Date(Date.UTC(2026, 2, 15)),
  );
  assert.equal(nextDue?.toISOString(), "2026-03-31T00:00:00.000Z");
});
