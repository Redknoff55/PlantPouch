import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  isActive: boolean;
}

export function BarcodeScanner({ onScan, onError, isActive }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const containerId = 'barcode-scanner-container';
    
    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          verbose: false,
        });
        
        scannerRef.current = scanner;
        
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.5,
          },
          (decodedText) => {
            onScan(decodedText);
          },
          () => {}
        );
        
        setHasPermission(true);
        setErrorMessage('');
      } catch (err: unknown) {
        console.error('Scanner error:', err);
        setHasPermission(false);
        const message = err instanceof Error ? err.message : 'Camera access denied';
        setErrorMessage(message);
        onError?.(message);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isActive, onScan, onError]);

  if (!isActive) return null;

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <div id="barcode-scanner-container" ref={containerRef} className="w-full h-full" />
      
      {hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-center p-4">
          <div className="text-amber-500 text-sm font-medium mb-2">Camera Access Required</div>
          <div className="text-muted-foreground text-xs max-w-xs">
            {errorMessage || 'Please allow camera access in your browser settings to scan barcodes.'}
          </div>
          <div className="text-muted-foreground text-xs mt-4">
            Note: Camera requires HTTPS in production
          </div>
        </div>
      )}
      
      {hasPermission === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-muted-foreground text-sm animate-pulse">Initializing camera...</div>
        </div>
      )}
    </div>
  );
}
