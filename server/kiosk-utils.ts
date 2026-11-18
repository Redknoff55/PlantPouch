import { addDays, addMonths, addWeeks } from "date-fns";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";
import type { KioskTemplateField } from "@shared/schema";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
};

type PdfTextPage = {
  items: PdfTextItem[];
};

type CheckboxWidget = {
  fieldName: string;
  pageIndex: number;
  x: number;
  y: number;
  onValue: string;
};

const isPdfTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === "object" &&
  item !== null &&
  "str" in item &&
  typeof item.str === "string" &&
  "transform" in item &&
  Array.isArray(item.transform) &&
  "width" in item &&
  typeof item.width === "number";

const fieldLabelFromName = (name: string) => {
  const knownLabels: Record<string, string> = {
    ID: "ID #",
    RatedCap: "Rated Capacity",
    DateInsp: "Date of Inspection",
    InspName: "Inspector Name (print)",
  };
  return knownLabels[name] ?? name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/([#])/g, " $1")
    .trim();
};

const checkboxOptionFromValue = (value: string): string | undefined => {
  const normalized = value.replace(/^\/+/, "").toLowerCase();
  if (/^(yes|y|true|sat|pass|acceptable|good)$/.test(normalized)) return "Yes";
  if (/^(no|n|false|unsat|fail|unacceptable|bad)$/.test(normalized)) return "No";
  return undefined;
};

const textLabelsByCheckboxRow = (
  widgets: CheckboxWidget[],
  textPages: PdfTextPage[],
  rowAxisByPage: Map<number, "x" | "y">,
) => {
  const labels = new Map<string, string>();
  const widgetsByPage = new Map<number, CheckboxWidget[]>();
  for (const widget of widgets) {
    const pageWidgets = widgetsByPage.get(widget.pageIndex) ?? [];
    pageWidgets.push(widget);
    widgetsByPage.set(widget.pageIndex, pageWidgets);
  }

  widgetsByPage.forEach((pageWidgets, pageIndex) => {
    const rowAxis = rowAxisByPage.get(pageIndex) ?? "x";
    const rowCenters: number[] = [];
    for (const widget of pageWidgets) {
      const coordinate = rowAxis === "x" ? widget.x : widget.y;
      if (!rowCenters.some((center) => Math.abs(center - coordinate) <= 5)) rowCenters.push(coordinate);
    }
    rowCenters.sort((left, right) => left - right);
    const spacing = rowCenters.slice(1).reduce(
      (minimum, center, index) => Math.min(minimum, center - rowCenters[index]),
      Number.POSITIVE_INFINITY,
    );
    const threshold = Number.isFinite(spacing) ? Math.min(20, spacing * 0.8) : 20;
    const candidates = textPages[pageIndex]?.items.flatMap((item) => {
      const coordinate = rowAxis === "x" ? item.transform[4] : item.transform[5];
      let nearestCenter: number | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const center of rowCenters) {
        const distance = Math.abs(coordinate - center);
        if (distance < nearestDistance) {
          nearestCenter = center;
          nearestDistance = distance;
        }
      }
      return nearestCenter !== undefined && nearestDistance <= threshold
        ? [{ item, center: nearestCenter, baseline: rowAxis === "x" ? item.transform[5] : item.transform[4] }]
        : [];
    }) ?? [];
    const baselineCounts = new Map<number, Set<number>>();
    for (const candidate of candidates) {
      const baseline = Array.from(baselineCounts.keys()).find((value) => Math.abs(value - candidate.baseline) < 2)
        ?? candidate.baseline;
      const centers = baselineCounts.get(baseline) ?? new Set<number>();
      centers.add(candidate.center);
      baselineCounts.set(baseline, centers);
    }
    const questionBaseline = Array.from(baselineCounts.entries())
      .sort((left, right) => right[1].size - left[1].size)[0]?.[0];
    if (questionBaseline === undefined) return;

    for (const center of rowCenters) {
      const question = candidates
        .filter((candidate) =>
          candidate.center === center && Math.abs(candidate.baseline - questionBaseline) < 2,
        )
        .sort((left, right) =>
          (rowAxis === "x" ? left.item.transform[4] : left.item.transform[5]) -
          (rowAxis === "x" ? right.item.transform[4] : right.item.transform[5]),
        )
        .map((candidate) => candidate.item.str.trim())
        .filter(Boolean)
        .join(" ");
      if (question) labels.set(`${pageIndex}:${center}`, question);
    }
  });
  return labels;
};

export const fieldsFromPdf = (
  pdf: PDFDocument,
  textPages: PdfTextPage[] = [],
): KioskTemplateField[] => {
  const formFields = pdf.getForm().getFields();
  const pages = pdf.getPages();
  const pageIndexByRef = new Map(pages.map((page, index) => [page.ref.toString(), index]));
  const checkboxWidgets: CheckboxWidget[] = [];

  for (const field of formFields) {
    if (!(field instanceof PDFCheckBox)) continue;
    for (const widget of field.acroField.getWidgets()) {
      const rectangle = widget.getRectangle();
      const pageIndex = pageIndexByRef.get(widget.P()?.toString() ?? "") ?? 0;
      checkboxWidgets.push({
        fieldName: field.getName(),
        pageIndex,
        x: rectangle.x + rectangle.width / 2,
        y: rectangle.y + rectangle.height / 2,
        onValue: widget.getOnValue()?.decodeText() ?? "Yes",
      });
    }
  }

  const widgetsByField = new Map<string, CheckboxWidget[]>();
  for (const widget of checkboxWidgets) {
    const fieldWidgets = widgetsByField.get(widget.fieldName) ?? [];
    fieldWidgets.push(widget);
    widgetsByField.set(widget.fieldName, fieldWidgets);
  }
  const rowAxisByPage = new Map<number, "x" | "y">();
  for (const pageIndex of Array.from(new Set(checkboxWidgets.map((widget) => widget.pageIndex)))) {
    const grouped = Array.from(widgetsByField.values()).filter((fieldWidgets) =>
      fieldWidgets.length > 1 && fieldWidgets.every((widget) => widget.pageIndex === pageIndex),
    );
    if (grouped.length) {
      const xSpread = grouped.reduce((sum, group) => sum + Math.abs(group[0].x - group[1].x), 0);
      const ySpread = grouped.reduce((sum, group) => sum + Math.abs(group[0].y - group[1].y), 0);
      rowAxisByPage.set(pageIndex, xSpread <= ySpread ? "x" : "y");
    } else {
      rowAxisByPage.set(pageIndex, pages[pageIndex]?.getRotation().angle % 180 ? "x" : "y");
    }
  }

  const rows = new Map<string, CheckboxWidget[]>();
  const rowKeyByWidget = new Map<CheckboxWidget, string>();
  const rowCentersByPage = new Map<number, Array<{ center: number; key: string }>>();
  for (const widget of checkboxWidgets) {
    const rowAxis = rowAxisByPage.get(widget.pageIndex) ?? "x";
    const rowCoordinate = rowAxis === "x" ? widget.x : widget.y;
    const pageRows = rowCentersByPage.get(widget.pageIndex) ?? [];
    let rowCenter = pageRows.find((candidate) => Math.abs(candidate.center - rowCoordinate) <= 5);
    if (!rowCenter) {
      rowCenter = { center: rowCoordinate, key: `${widget.pageIndex}:${rowCoordinate}` };
      pageRows.push(rowCenter);
      rowCentersByPage.set(widget.pageIndex, pageRows);
    }
    const key = rowCenter.key;
    const row = rows.get(key) ?? [];
    row.push(widget);
    rows.set(key, row);
    rowKeyByWidget.set(widget, key);
  }

  const groupedQuestionFields = new Map<string, KioskTemplateField>();
  const groupedCheckboxNames = new Set<string>();
  const textLabels = textLabelsByCheckboxRow(checkboxWidgets, textPages, rowAxisByPage);
  rows.forEach((rowWidgets, rowKey) => {
    const rowAxis = rowAxisByPage.get(rowWidgets[0].pageIndex) ?? "x";
    const slotAxis = rowAxis === "x" ? "y" : "x";
    const slots = new Map<number, CheckboxWidget[]>();
    for (const widget of rowWidgets) {
      const coordinate = slotAxis === "x" ? widget.x : widget.y;
      const slot = Array.from(slots.keys()).find((value) => Math.abs(value - coordinate) <= 8) ?? coordinate;
      const slotWidgets = slots.get(slot) ?? [];
      slotWidgets.push(widget);
      slots.set(slot, slotWidgets);
    }
    if (slots.size !== 2 || Array.from(slots.values()).some((slotWidgets) => slotWidgets.length !== 1)) return;

    const orderedSlots = Array.from(slots.values()).sort((left, right) =>
      (left[0][slotAxis] - right[0][slotAxis]),
    );
    const sortedValues = orderedSlots.map((slotWidgets) => slotWidgets[0].onValue);
    const directOptions = sortedValues.map(checkboxOptionFromValue);
    const optionByWidget = new Map<CheckboxWidget, string>();
    if (new Set(directOptions).size === 2 && directOptions.every(Boolean)) {
      orderedSlots.forEach((slotWidgets, index) => optionByWidget.set(slotWidgets[0], directOptions[index]!));
    } else {
      orderedSlots.forEach((slotWidgets, index) => optionByWidget.set(slotWidgets[0], index === 0 ? "Yes" : "No"));
    }

    const bindingWidgets = orderedSlots.map((slotWidgets) => slotWidgets[0]);
    const distinctNames = new Set(bindingWidgets.map((widget) => widget.fieldName));
    const answerFields = new Map<string, string>();
    for (const widget of bindingWidgets) {
      const option = optionByWidget.get(widget)!;
      if (answerFields.has(option)) {
        answerFields.clear();
        break;
      }
      answerFields.set(option, widget.fieldName);
    }
    if (
      answerFields.size !== 2 ||
      (distinctNames.size === 1 && new Set(bindingWidgets.map((widget) => widget.onValue)).size !== 2)
    ) return;

    const [pageIndex, rowCenterString] = rowKey.split(":");
    const pageIndexNumber = Number(pageIndex);
    const rowCenter = Number(rowCenterString);
    const label = textLabels.get(`${pageIndexNumber}:${rowCenter}`) ??
      fieldLabelFromName(bindingWidgets[0].fieldName);
    const fieldName = bindingWidgets[0].fieldName;
    const field: KioskTemplateField = {
      name: fieldName,
      label,
      type: "radio",
      multiline: false,
      required: true,
      source: "answer",
      options: ["Yes", "No"],
      pdfBindings: bindingWidgets.map((widget) => ({
        option: optionByWidget.get(widget)!,
        fieldName: widget.fieldName,
        onValue: widget.onValue,
      })),
    };
    groupedQuestionFields.set(rowKey, field);
    for (const widget of bindingWidgets) groupedCheckboxNames.add(widget.fieldName);
  });

  const checkboxRowsByField = new Map<string, string>();
  for (const widget of checkboxWidgets) {
    if (!checkboxRowsByField.has(widget.fieldName)) {
      checkboxRowsByField.set(widget.fieldName, rowKeyByWidget.get(widget)!);
    }
  }

  const detectedFields: KioskTemplateField[] = formFields.flatMap((field) => {
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
    if (field instanceof PDFCheckBox && groupedCheckboxNames.has(field.getName())) return [];
    let rowKey = checkboxRowsByField.get(field.getName());
    if (field instanceof PDFTextField && /comment/i.test(field.getName())) {
      const widget = field.acroField.getWidgets()[0];
      const rectangle = widget?.getRectangle();
      const pageIndex = pageIndexByRef.get(widget?.P()?.toString() ?? "") ?? 0;
      const rowAxis = rowAxisByPage.get(pageIndex) ?? "x";
      const coordinate = rectangle
        ? rowAxis === "x" ? rectangle.x + rectangle.width / 2 : rectangle.y + rectangle.height / 2
        : undefined;
      const nearestRow = coordinate === undefined
        ? undefined
        : rowCentersByPage.get(pageIndex)?.reduce<{ center: number; distance: number; key: string } | undefined>(
            (nearest, row) => {
              const distance = Math.abs(row.center - coordinate);
              return !nearest || distance < nearest.distance ? { ...row, distance } : nearest;
            },
            undefined,
          );
      if (nearestRow && nearestRow.distance <= 8) rowKey = nearestRow.key;
    }
    const questionLabel = rowKey ? textLabels.get(rowKey) : undefined;
    const normalizedName = field.getName().toLowerCase();
    const source: KioskTemplateField["source"] =
      /^(insp(name|ector)?|inspector(name)?)$/.test(normalizedName)
        ? "technician_name"
        : /^(dateinsp|inspectiondate|dateofinspection)$/.test(normalizedName)
          ? "submitted_at"
          : "answer";
    return type ? [{
      name: field.getName(),
      label: questionLabel && /comment/i.test(field.getName())
        ? `Comments / Repairs Needed - ${questionLabel}`
        : fieldLabelFromName(field.getName()),
      type,
      multiline,
      required: false,
      source,
      options,
      pdfBindings: [],
    }] : [];
  });
  const questionFields = Array.from(groupedQuestionFields.values());
  return detectedFields.concat(questionFields).sort((left, right) =>
    formFields.findIndex((field) => field.getName() === left.name) -
    formFields.findIndex((field) => field.getName() === right.name),
  );
};

export const inspectKioskPdf = async (pdf: PDFDocument, pdfBytes: Uint8Array) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const textDocument = await loadingTask.promise;
  const textPages: PdfTextPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= textDocument.numPages; pageNumber += 1) {
      const page = await textDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (isPdfTextItem(item)) {
          items.push({ str: item.str, transform: item.transform, width: item.width });
        }
      }
      textPages.push({
        items,
      });
    }
  } finally {
    await textDocument.destroy();
  }
  const revisionText = textPages.flatMap((page) => page.items.map((item) => item.str)).join(" ");
  const revision = /\b(?:rev(?:ision)?|ver(?:sion)?)\s*\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._-]*)/i
    .exec(revisionText)?.[1] ?? null;
  return { fields: fieldsFromPdf(pdf, textPages), revision };
};

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
  const mappedCheckboxStates = new Map<string, string>();
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
    } else if (field.type === "radio" && (field.pdfBindings ?? []).length) {
      const bindings = field.pdfBindings ?? [];
      const selectedBinding = bindings.find((binding) => binding.option === value);
      for (const fieldName of Array.from(new Set(bindings.map((binding) => binding.fieldName)))) {
        const binding = selectedBinding?.fieldName === fieldName ? selectedBinding : undefined;
        mappedCheckboxStates.set(fieldName, binding?.onValue ?? "Off");
      }
    } else if (field.type === "radio") form.getRadioGroup(field.name).select(String(value));
    else if (field.type === "dropdown") form.getDropdown(field.name).select(String(value));
    else form.getOptionList(field.name).select(String(value));
  }
  mappedCheckboxStates.forEach((state, fieldName) => {
    const checkbox = form.getCheckBox(fieldName);
    const pdfState = PDFName.of(state);
    checkbox.acroField.dict.set(PDFName.of("V"), pdfState);
    for (const widget of checkbox.acroField.getWidgets()) {
      const widgetState = widget.getOnValue()?.decodeText() === state ? pdfState : PDFName.of("Off");
      widget.setAppearanceState(widgetState);
    }
  });
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
