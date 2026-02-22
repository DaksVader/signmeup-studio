import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react"; // Added RotateCcw for the button icon
import { holisticDetector } from "@/lib/mediapipeDetector";
import { actionLstmPipeline } from "@/lib/actionLstmPipeline";
import { LandmarkSmoother } from "@/lib/oneEuroFilter";

// MediaPipe drawing utils
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import { POSE_CONNECTIONS, HAND_CONNECTIONS } from "@mediapipe/holistic";

type ModelStatus = "loading" | "ready" | "error";
type FacingMode = "user" | "environment";

interface CameraFeedProps {
  isActive: boolean;
  isPaused: boolean;
  onSignDetected: (letter: string | null) => void;
  currentWord: string;
  onModelsLoaded: () => void;
}

const CameraFeed = ({ 
  isActive, 
  isPaused, 
  onSignDetected, 
  currentWord, 
  onModelsLoaded 
}: CameraFeedProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const facingModeRef = useRef<FacingMode>("user");

  const [status, setStatus] = useState<ModelStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentFacingMode, setCurrentFacingMode] = useState<FacingMode>("user");

  const smootherRef = useRef(new LandmarkSmoother(1662));

  const stopStream = useCallback(() => {
    if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    renderFrameRef.current = null;
    streamRef.current = null;
  }, []);

  const drawLandmarksOnCanvas = (ctx: CanvasRenderingContext2D, results: any) => {
    if (!results) return;

    if (results.leftHandLandmarks) {
      drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
      drawLandmarks(ctx, results.leftHandLandmarks, { color: "#10b981", lineWidth: 1, radius: 2 });
    }
    if (results.rightHandLandmarks) {
      drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
      drawLandmarks(ctx, results.rightHandLandmarks, { color: "#0ea5e9", lineWidth: 1, radius: 2 });
    }

    if (results.poseLandmarks) {
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "rgba(255,255,255,0.2)", lineWidth: 1 });
    }
  };

  const startStream = useCallback(async (mode: FacingMode) => {
    stopStream(); // Ensure old stream is killed before starting new one
    if (!videoRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          facingMode: mode 
        },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      await new Promise<void>((resolve) => {
        videoRef.current!.onloadedmetadata = () => {
          videoRef.current!.play();
          resolve();
        };
      });

      const renderLoop = async () => {
        if (isStoppingRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          renderFrameRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.save();
        // Use the ref to check mirroring logic
        if (facingModeRef.current === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (holisticDetector.ready) {
          try {
            const features = await holisticDetector.extractFeatures(video);
            const results = (holisticDetector as any).lastResults;

            if (results) {
              drawLandmarksOnCanvas(ctx, results);
            }

            const hasHands = !!(results?.leftHandLandmarks || results?.rightHandLandmarks);
            
            if (features && !isPaused && hasHands) {
              const smoothed = smootherRef.current.smooth(features);
              actionLstmPipeline.pushFrame(smoothed);
              const prediction = await actionLstmPipeline.predict();
              
              if (prediction && prediction.action) {
                onSignDetected(prediction.action);
              }
            } else if (!hasHands) {
              actionLstmPipeline.clearBuffer();
            }
          } catch (err) {
            console.warn("Frame detection skipped:", err);
          }
        }

        ctx.restore();
        renderFrameRef.current = requestAnimationFrame(renderLoop);
      };

      renderLoop();
    } catch (err) {
      setStatus("error");
      setErrorMessage("Camera access denied.");
    }
  }, [isPaused, onSignDetected, stopStream]);

  // New toggle function
  const toggleCamera = async () => {
    const newMode = facingModeRef.current === "user" ? "environment" : "user";
    facingModeRef.current = newMode;
    setCurrentFacingMode(newMode);
    await startStream(newMode);
  };

  useEffect(() => {
    if (!isActive) {
      stopStream();
      setStatus("loading");
      return;
    }

    const init = async () => {
      try {
        setStatus("loading");
        isStoppingRef.current = false;
        await holisticDetector.initialize();
        await actionLstmPipeline.initialize();
        await startStream(facingModeRef.current);
        setStatus("ready");
        onModelsLoaded();
      } catch (err) {
        console.error("Initialization failed:", err);
        setStatus("error");
      }
    };

    init();
    return () => {
      isStoppingRef.current = true;
      stopStream();
    };
  }, [isActive, startStream, stopStream, onModelsLoaded]);

  return (
    <div className="flex flex-col items-center p-4 max-w-5xl mx-auto w-full">
      <motion.div className="w-full flex flex-col gap-4">
        <div className="relative aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={canvasRef} className="w-full h-full object-cover" />
          
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="font-medium animate-pulse">Calibrating AI Vision...</p>
            </div>
          )}

          {/* Camera Switch Button */}
          {status === "ready" && (
            <button
              onClick={toggleCamera}
              className="absolute bottom-4 right-4 z-20 p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white transition-all active:scale-95"
              title="Switch Camera"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
          )}

          {isPaused && status === "ready" && (
            <div className="absolute top-4 right-4 bg-yellow-500/80 text-black px-3 py-1 rounded-full text-xs font-bold animate-pulse">
              PAUSED
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/20 text-white z-10">
              <p className="font-medium">{errorMessage || "Failed to load models."}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CameraFeed;