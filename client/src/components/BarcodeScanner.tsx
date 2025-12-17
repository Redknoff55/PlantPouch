import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  isActive: boolean;
}

export function BarcodeScanner({ onScan, onError, isActive }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const mountedRef = useRef(true);

  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          scanner.stop().then(() => {
            scanner.clear();
          }).catch(console.error);
        } else {
          try { scanner.clear(); } catch {}
        }
        scannerRef.current = null;
      }
      setIsScanning(false);
      return;
    }

    const containerId = 'barcode-scanner-container';
    
    setHasPermission(null);
    setErrorMessage('');

    const startScanner = async () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch {}
        scannerRef.current = null;
      }
      
      const container = document.getElementById(containerId);
      if (!container || !mountedRef.current) {
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
            if (mountedRef.current && onScanRef.current) {
              onScanRef.current(decodedText);
            }
          },
          () => {}
        );
        
        if (mountedRef.current) {
          setHasPermission(true);
          setIsScanning(true);
          setErrorMessage('');
        }
      } catch (err: unknown) {
        console.error('Scanner error:', err);
        if (mountedRef.current) {
          setHasPermission(false);
          setIsScanning(false);
          const message = err instanceof Error ? err.message : 'Camera access denied';
          setErrorMessage(message);
          if (onErrorRef.current) {
            onErrorRef.current(message);
          }
        }
      }
    };

    const timer = setTimeout(startScanner, 150);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          scanner.stop().then(() => {
            try { scanner.clear(); } catch {}
          }).catch(console.error);
        } else {
          try { scanner.clear(); } catch {}
        }
        scannerRef.current = null;
      }
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <div id="barcode-scanner-container" className="w-full h-full" />
      
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
