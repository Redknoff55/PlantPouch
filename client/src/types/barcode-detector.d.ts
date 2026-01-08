interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetector {
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

declare var BarcodeDetector: {
  prototype: BarcodeDetector;
  new (options?: { formats: string[] }): BarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};