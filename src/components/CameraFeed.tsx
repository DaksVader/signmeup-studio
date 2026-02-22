import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react";
import { holisticDetector } from "@/lib/mediapipeDetector";
import { actionLstmPipeline } from "@/lib/actionLstmPipeline";
import { LandmarkSmoother } from "@/lib/oneEuroFilter";
import { POSE_CONNECTIONS, HAND_CONNECTIONS } from "@mediapipe/holistic";

const CameraFeed = ({ isActive, isPaused, onSignDetected, onModelsLoaded }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isSwitching, setIsSwitching] = useState(false);
  const smootherRef = useRef(new LandmarkSmoother(1662));

  const cleanup = useCallback(() => {
    if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    renderFrameRef.current = null;
    streamRef.current = null;
  }, []);

  const draw = (ctx: CanvasRenderingContext2D, results: any) => {
    const win = window as any;
    if (!results || !win.drawConnectors) return;
    if (results.leftHandLandmarks) {
      win.drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
      win.drawLandmarks(ctx, results.leftHandLandmarks, { color: "#10b981", lineWidth: 1, radius: 2 });
    }
    if (results.rightHandLandmarks) {
      win.drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
      win.drawLandmarks(ctx, results.rightHandLandmarks, { color: "#0ea5e9", lineWidth: 1, radius: 2 });
    }
  };

  const start = useCallback(async () => {
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: facingMode }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const loop = async () => {
        if (!videoRef.current || !canvasRef.current || isSwitching) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx || video.paused) {
          renderFrameRef.current = requestAnimationFrame(loop);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.save();
        if (facingMode === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (holisticDetector.ready && !isPaused) {
          const features = await holisticDetector.extractFeatures(video);
          const results = (holisticDetector as any).lastResults;
          if (results) draw(ctx, results);
          if (features && (results?.leftHandLandmarks || results?.rightHandLandmarks)) {
            const smoothed = smootherRef.current.smooth(features);
            actionLstmPipeline.pushFrame(smoothed);
            const prediction = await actionLstmPipeline.predict();
            if (prediction) onSignDetected(prediction.action);
          }
        }
        ctx.restore();
        renderFrameRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { setStatus("error"); }
  }, [facingMode, isPaused, isSwitching, onSignDetected, cleanup]);

  const toggleCamera = async () => {
    setIsSwitching(true);
    cleanup();
    await holisticDetector.rebind(); // Reset AI internal state
    await new Promise(r => setTimeout(r, 600)); // Mobile hardware cooldown
    setFacingMode(prev => prev === "user" ? "environment" : "user");
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
  }, [isActive, facingMode, start, cleanup, onModelsLoaded]);

  return (
    <div className="flex flex-col items-center p-4 w-full">
      <div className="relative aspect-video bg-black rounded-3xl overflow-hidden w-full shadow-2xl border border-white/5">
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
        
        <AnimatePresence>
          {(status === "loading" || isSwitching) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
              <Loader2 className="w-10 h-10 animate-spin text-teal-500 mb-4" />
              <p className="text-white text-sm font-medium">{isSwitching ? "Syncing Sensors..." : "Initializing..."}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {status === "ready" && !isSwitching && (
          <button onClick={toggleCamera} className="absolute bottom-6 right-6 p-4 bg-teal-600/20 hover:bg-teal-600/40 backdrop-blur-2xl rounded-full text-white border border-white/20 shadow-xl transition-all active:scale-90">
            <RotateCcw className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;