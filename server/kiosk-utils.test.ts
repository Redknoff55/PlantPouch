import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import type { KioskTemplateField } from "@shared/schema";
import { fieldsFromPdf, fillKioskPdf, nextScheduledDueDate, validateKioskAnswers } from "./kiosk-utils";

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
