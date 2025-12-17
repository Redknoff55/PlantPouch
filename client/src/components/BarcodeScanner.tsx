import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [isScanning, setIsScanning] = useState(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      scannerRef.current = null;
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      stopScanner();
      return;
    }

    const containerId = 'barcode-scanner-container';
    
    setHasPermission(null);
    setErrorMessage('');

    const startScanner = async () => {
      await stopScanner();
      
      const container = document.getElementById(containerId);
      if (!container) {
        console.error('Scanner container not found');
        return;
      }

      try {
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        });
        
        scannerRef.current = scanner;
        
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdge * 0.8);
              return {
                width: Math.min(qrboxSize, 400),
                height: Math.min(Math.floor(qrboxSize * 0.6), 200)
              };
            },
            aspectRatio: 1.777,
            disableFlip: false,
          },
          (decodedText) => {
            console.log('Barcode detected:', decodedText);
            onScan(decodedText);
          },
          () => {}
        );
        
        setHasPermission(true);
        setIsScanning(true);
        setErrorMessage('');
      } catch (err: unknown) {
        console.error('Scanner error:', err);
        setHasPermission(false);
        setIsScanning(false);
        const message = err instanceof Error ? err.message : 'Camera access denied';
        setErrorMessage(message);
        onError?.(message);
      }
    };

    const timer = setTimeout(startScanner, 100);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isActive, onScan, onError, stopScanner]);

  if (!isActive) return null;

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <div id="barcode-scanner-container" ref={containerRef} className="w-full h-full" />
      
      {hasPermission === true && isScanning && (
        <div className="absolute bottom-2 left-0 right-0 text-center">
          <span className="text-xs text-green-400 bg-black/50 px-2 py-1 rounded">
            Camera active - point at barcode
          </span>
        </div>
      )}
      
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
