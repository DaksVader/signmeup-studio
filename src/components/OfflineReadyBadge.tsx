import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

const OfflineReadyBadge = ({ modelsLoaded }: { modelsLoaded?: boolean }) => {
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(() => setSwReady(true));
    }
  }, []);

  const isOfflineReady = swReady && modelsLoaded;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        isOfflineReady
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isOfflineReady ? (
        <>
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Offline Ready
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Loading…
        </>
      )}
    </span>
  );
};

export default OfflineReadyBadge;
