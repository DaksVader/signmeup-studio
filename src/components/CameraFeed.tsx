import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react";
import { holisticDetector } from "@/lib/mediapipeDetector";
import { actionLstmPipeline } from "@/lib/actionLstmPipeline";
import { LandmarkSmoother } from "@/lib/oneEuroFilter";
import { POSE_CONNECTIONS, HAND_CONNECTIONS } from "@mediapipe/holistic";

type ModelStatus = "loading" | "ready" | "error";
type FacingMode = "user" | "environment";

const CameraFeed = ({ isActive, isPaused, onSignDetected, onModelsLoaded }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // CRITICAL: This ref stops the AI loop instantly during a switch
  const processingLocked = useRef(false);
  const facingModeRef = useRef<FacingMode>("user");

  const [status, setStatus] = useState<ModelStatus>("loading");
  const [isSwitching, setIsSwitching] = useState(false);
  const smootherRef = useRef(new LandmarkSmoother(1662));

  const stopStream = useCallback(() => {
    processingLocked.current = true; // Close the gate
    if (renderFrameRef.current) {
      cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const drawLandmarksOnCanvas = (ctx: CanvasRenderingContext2D, results: any) => {
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
    if (results.poseLandmarks) {
      win.drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "rgba(255,255,255,0.2)", lineWidth: 1 });
    }
  };

  const startStream = useCallback(async (mode: FacingMode) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: mode }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      processingLocked.current = false; // Open the gate

      const renderLoop = async () => {
        if (processingLocked.current || !videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx || video.paused || video.ended) {
          renderFrameRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.save();
        if (facingModeRef.current === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (holisticDetector.ready && !isPaused && !processingLocked.current) {
          try {
            const features = await holisticDetector.extractFeatures(video);
            const results = (holisticDetector as any).lastResults;
            if (results) drawLandmarksOnCanvas(ctx, results);
            
            if (features && (results?.leftHandLandmarks || results?.rightHandLandmarks)) {
              const smoothed = smootherRef.current.smooth(features);
              actionLstmPipeline.pushFrame(smoothed);
              const prediction = await actionLstmPipeline.predict();
              if (prediction) onSignDetected(prediction.action);
            }
          } catch (e) { /* skip frame */ }
        }

        ctx.restore();
        renderFrameRef.current = requestAnimationFrame(renderLoop);
      };

      renderLoop();
    } catch (err) {
      setStatus("error");
    }
  }, [isPaused, onSignDetected]);

  const toggleCamera = async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    
    stopStream();
    holisticDetector.reset(); // Clear AI memory
    
    // Crucial: Wait for the phone hardware to "click" off
    await new Promise(r => setTimeout(r, 800));
    
    facingModeRef.current = facingModeRef.current === "user" ? "environment" : "user";
    await startStream(facingModeRef.current);
    
    setIsSwitching(false);
  };

  useEffect(() => {
    const init = async () => {
      await holisticDetector.initialize();
      await actionLstmPipeline.initialize();
      await startStream(facingModeRef.current);
      setStatus("ready");
      onModelsLoaded();
    };
    if (isActive) init();
    return () => stopStream();
  }, [isActive, startStream, stopStream, onModelsLoaded]);

  return (
    <div className="flex flex-col items-center p-4 w-full">
      <div className="relative aspect-video bg-black rounded-3xl overflow-hidden w-full shadow-2xl">
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
        
        <AnimatePresence>
          {(status === "loading" || isSwitching) && (
            <motion.div exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
              <Loader2 className="w-10 h-10 animate-spin text-teal-500 mb-4" />
              <p className="text-white animate-pulse">{isSwitching ? "Reconfiguring Sensors..." : "Loading AI..."}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {status === "ready" && !isSwitching && (
          <button onClick={toggleCamera} className="absolute bottom-6 right-6 p-4 bg-white/20 backdrop-blur-xl rounded-full text-white border border-white/30 shadow-xl">
            <RotateCcw className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;