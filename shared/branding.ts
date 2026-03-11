import { z } from "zod";

export const fontPresetValues = ["industrial", "source", "plex"] as const;

export type FontPreset = (typeof fontPresetValues)[number];

export const fontPresetOptions: Array<{ value: FontPreset; label: string }> = [
  { value: "industrial", label: "Inter / JetBrains Mono" },
  { value: "source", label: "Source Sans 3 / Source Code Pro" },
  { value: "plex", label: "IBM Plex Sans / IBM Plex Mono" },
];

const dataImagePrefix = /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i;

export const brandingSchema = z.object({
  appName: z.string().trim().min(1).max(80),
  version: z.string().trim().min(1).max(40),
  fontPreset: z.enum(fontPresetValues).default("industrial"),
  logo: z.object({
    text: z.string().trim().max(12).optional().default("PP"),
    imageSrc: z
      .string()
      .trim()
      .max(350_000)
      .refine((value) => value.length === 0 || dataImagePrefix.test(value), {
        message: "Logo image must be a locally uploaded image.",
      })
      .optional()
      .default(""),
    alt: z.string().trim().max(120).optional().default("PlantPouch logo"),
  }),
});

export type BrandingConfig = z.infer<typeof brandingSchema>;
