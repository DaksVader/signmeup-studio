import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCcw, Zap, ZapOff } from "lucide-react";
import { holisticDetector } from "@/lib/mediapipeDetector";
import { actionLstmPipeline } from "@/lib/actionLstmPipeline";
import { LandmarkSmoother } from "@/lib/oneEuroFilter";
import { HAND_CONNECTIONS } from "@mediapipe/holistic";

const CameraFeed = ({ isActive, isPaused, onSignDetected, onModelsLoaded }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [sessionKey, setSessionKey] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isSwitching, setIsSwitching] = useState(false);
  const [torch, setTorch] = useState(false);
  
  const processingLocked = useRef(false);
  const smootherRef = useRef(new LandmarkSmoother(1662));

  const cleanup = useCallback(() => {
    processingLocked.current = true;
    if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && facingMode === "environment") {
      try {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          const newState = !torch;
          await track.applyConstraints({ advanced: [{ torch: newState }] as any });
          setTorch(newState);
        }
      } catch (e) { console.warn("Torch fail"); }
    }
  };

  const start = useCallback(async () => {
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 720 }, height: { ideal: 1280 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      processingLocked.current = false;
      const loop = async () => {
        if (processingLocked.current || !videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        
        if (!ctx || video.paused || video.readyState < 2) {
          renderFrameRef.current = requestAnimationFrame(loop);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.save();
        if (facingMode === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (holisticDetector.ready && !isPaused && !processingLocked.current) {
          // Send camera state to detector for coordinate normalization
          const features = await holisticDetector.extractFeatures(video, facingMode === "environment");
          const results = (holisticDetector as any).lastResults;
          
          if (results) {
            const win = window as any;
            if (results.leftHandLandmarks) win.drawConnectors?.(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
            if (results.rightHandLandmarks) win.drawConnectors?.(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
          }
          
          if (features && (results?.leftHandLandmarks || results?.rightHandLandmarks)) {
            actionLstmPipeline.pushFrame(smootherRef.current.smooth(features));
            const prediction = await actionLstmPipeline.predict();
            if (prediction) onSignDetected(prediction.action);
          }
        }
        ctx.restore();
        renderFrameRef.current = requestAnimationFrame(loop);
      };
      renderFrameRef.current = requestAnimationFrame(loop);
    } catch (e) { setStatus("error"); }
  }, [facingMode, isPaused, onSignDetected, cleanup]);

  const toggleCamera = async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    cleanup();
    setTorch(false);
    actionLstmPipeline.clearBuffer(); 
    await holisticDetector.reset(); 
    await new Promise(r => setTimeout(r, 1000));
    setFacingMode(p => p === "user" ? "environment" : "user");
    setSessionKey(k => k + 1);
    setIsSwitching(false);
  };

  useEffect(() => {
    if (isActive) {
      const init = async () => {
        await holisticDetector.initialize();
        await actionLstmPipeline.initialize();
        await start();
        setStatus("ready");
        onModelsLoaded();
      };
      init();
    }
    return () => cleanup();
  }, [isActive, sessionKey, start, cleanup, onModelsLoaded]);

  return (
    <div className="flex flex-col items-center p-2 w-full max-w-2xl mx-auto">
      <div key={sessionKey} className="relative aspect-[3/4] md:aspect-video bg-black rounded-[2.5rem] overflow-hidden w-full shadow-2xl border-4 border-white/10">
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
        <AnimatePresence>
          {(status === "loading" || isSwitching) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
              <Loader2 className="w-12 h-12 animate-spin text-teal-500 mb-4" />
              <p className="text-white font-medium">Calibrating AI...</p>
            </motion.div>
          )}
        </AnimatePresence>
        {status === "ready" && !isSwitching && (
          <div className="absolute bottom-8 right-6 flex flex-col gap-4">
            {facingMode === "environment" && (
              <button onClick={toggleTorch} className="p-4 bg-yellow-500/20 hover:bg-yellow-500/40 backdrop-blur-2xl rounded-full text-yellow-400 border border-yellow-500/30">
                {torch ? <Zap className="fill-current" /> : <ZapOff />}
              </button>
            )}
            <button onClick={toggleCamera} className="p-5 bg-teal-500/20 hover:bg-teal-500/40 backdrop-blur-2xl rounded-full text-white border border-white/20">
              <RotateCcw className="w-7 h-7" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;