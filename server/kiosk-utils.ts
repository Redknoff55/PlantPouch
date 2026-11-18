import { addDays, addMonths, addWeeks } from "date-fns";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";
import type { KioskTemplateField } from "@shared/schema";

export const fieldsFromPdf = (pdf: PDFDocument): KioskTemplateField[] =>
  pdf.getForm().getFields().flatMap((field) => {
    let type: KioskTemplateField["type"] | undefined;
    let options: string[] = [];
    let multiline = false;
    if (field instanceof PDFTextField) {
      type = "text";
      multiline = field.isMultiline();
    } else if (field instanceof PDFCheckBox) {
      type = "checkbox";
    } else if (field instanceof PDFRadioGroup) {
      type = "radio";
      options = field.getOptions();
    } else if (field instanceof PDFDropdown) {
      type = "dropdown";
      options = field.getOptions();
    } else if (field instanceof PDFOptionList) {
      type = "option-list";
      options = field.getOptions();
    }
    return type ? [{
      name: field.getName(),
      label: field.getName(),
      type,
      multiline,
      required: false,
      source: "answer" as const,
      options,
    }] : [];
  });

export const validateKioskAnswers = (
  fields: KioskTemplateField[],
  answers: Record<string, string | boolean>,
) => {
  const fieldNames = new Set(fields.map((field) => field.name));
  if (Object.keys(answers).some((name) => !fieldNames.has(name))) {
    return "Answers include a field that is not part of this form";
  }
  for (const field of fields) {
    if (field.source !== "answer") continue;
    const value = answers[field.name];
    if (field.required && (
      value === undefined ||
      value === false ||
      (typeof value === "string" && !value.trim())
    )) return `${field.label} is required`;
    if (value === undefined) continue;
    if (field.type === "checkbox" && typeof value !== "boolean") {
      return `${field.label} must be checked or unchecked`;
    }
    if (field.type !== "checkbox" && typeof value !== "string") {
      return `${field.label} must contain text`;
    }
    if (typeof value === "string" && field.options.length && value && !field.options.includes(value)) {
      return `${field.label} has an invalid selection`;
    }
  }
  return undefined;
};

export const fillKioskPdf = async (
  pdfBytes: Uint8Array,
  fields: KioskTemplateField[],
  answers: Record<string, string | boolean>,
  context: { technicianName: string; workOrder: string; submittedAt: Date; supervisorName?: string },
) => {
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();
  for (const field of fields) {
    let value: string | boolean | undefined;
    switch (field.source) {
      case "technician_name":
        value = context.technicianName;
        break;
      case "work_order":
        value = context.workOrder;
        break;
      case "submitted_at":
        value = context.submittedAt.toLocaleDateString("en-US");
        break;
      case "supervisor_name":
        value = context.supervisorName;
        break;
      default:
        value = answers[field.name];
    }
    if (value === undefined || value === "") continue;
    if (field.type === "text") form.getTextField(field.name).setText(String(value));
    else if (field.type === "checkbox") {
      const checkbox = form.getCheckBox(field.name);
      if (value === true) checkbox.check();
      else checkbox.uncheck();
    } else if (field.type === "radio") form.getRadioGroup(field.name).select(String(value));
    else if (field.type === "dropdown") form.getDropdown(field.name).select(String(value));
    else form.getOptionList(field.name).select(String(value));
  }
  form.updateFieldAppearances();
  return Buffer.from(await pdf.save());
};

const addCalendarInterval = (date: Date, interval: number, unit: string) => {
  if (unit === "day") return addDays(date, interval);
  if (unit === "week") return addWeeks(date, interval);
  return addMonths(date, interval);
};

export const nextScheduledDueDate = (
  currentDueAt: Date | null | undefined,
  firstDueAt: Date | null,
  interval: number | null,
  unit: string | null,
  effectiveAt: Date,
) => {
  const anchor = currentDueAt ?? firstDueAt;
  if (!anchor || !interval || !unit || anchor > effectiveAt) return anchor;
  let periods = 1;
  let nextDueAt = addCalendarInterval(anchor, interval, unit);
  while (nextDueAt <= effectiveAt) {
    periods += 1;
    nextDueAt = addCalendarInterval(anchor, interval * periods, unit);
  }
  return nextDueAt;
};
