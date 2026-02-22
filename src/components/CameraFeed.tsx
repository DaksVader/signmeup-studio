import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react";
import { holisticDetector } from "@/lib/mediapipeDetector";
import { actionLstmPipeline } from "@/lib/actionLstmPipeline";
import { LandmarkSmoother } from "@/lib/oneEuroFilter";
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

const CameraFeed = ({ isActive, isPaused, onSignDetected, onModelsLoaded }: CameraFeedProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const facingModeRef = useRef<FacingMode>("user");

  const [status, setStatus] = useState<ModelStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const smootherRef = useRef(new LandmarkSmoother(1662));

  const stopStream = useCallback(() => {
    if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    renderFrameRef.current = null;
    streamRef.current = null;
  }, []);

  const drawLandmarksOnCanvas = (ctx: CanvasRenderingContext2D, results: any) => {
    if (!results) return;
    const win = window as any;
    const drawConnectors = win.drawConnectors;
    const drawLandmarks = win.drawLandmarks;
    if (!drawConnectors || !drawLandmarks) return;

    // Draw Hands
    if (results.leftHandLandmarks) {
      drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
      drawLandmarks(ctx, results.leftHandLandmarks, { color: "#10b981", lineWidth: 1, radius: 2 });
    }
    if (results.rightHandLandmarks) {
      drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "white", lineWidth: 2 });
      drawLandmarks(ctx, results.rightHandLandmarks, { color: "#0ea5e9", lineWidth: 1, radius: 2 });
    }
    // Draw Pose (at lower opacity)
    if (results.poseLandmarks) {
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "rgba(255,255,255,0.2)", lineWidth: 1 });
    }
  };

  const startStream = useCallback(async (mode: FacingMode) => {
    stopStream();
    if (!videoRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: mode },
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
        if (isStoppingRef.current || !videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set dimensions match video
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

        // 1. Draw the Video Frame
        ctx.save();
        if (facingModeRef.current === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 2. Process AI
        if (holisticDetector.ready && !isPaused) {
          try {
            const features = await holisticDetector.extractFeatures(video);
            const results = (holisticDetector as any).lastResults;

            if (results) {
              drawLandmarksOnCanvas(ctx, results);
              
              const hasHands = results.leftHandLandmarks || results.rightHandLandmarks;
              if (features && hasHands) {
                const smoothed = smootherRef.current.smooth(features);
                actionLstmPipeline.pushFrame(smoothed);
                
                const prediction = await actionLstmPipeline.predict();
                if (prediction) {
                  onSignDetected(prediction.action);
                }
              }
            }
          } catch (err) {
            console.error("Detection error:", err);
          }
        }

        ctx.restore();
        renderFrameRef.current = requestAnimationFrame(renderLoop);
      };

      renderLoop();
    } catch (err) {
      console.error("Camera Error:", err);
      setStatus("error");
      setErrorMessage("Camera access denied.");
    }
  }, [isPaused, onSignDetected, stopStream]);

  const toggleCamera = async () => {
    facingModeRef.current = facingModeRef.current === "user" ? "environment" : "user";
    await startStream(facingModeRef.current);
  };

  useEffect(() => {
    if (!isActive) {
      stopStream();
      return;
    }

    const init = async () => {
      try {
        isStoppingRef.current = false;
        await holisticDetector.initialize();
        await actionLstmPipeline.initialize();
        await startStream(facingModeRef.current);
        setStatus("ready");
        onModelsLoaded();
      } catch (err) {
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
      <div className="relative aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 w-full">
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
        
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10">
            <Loader2 className="w-10 h-10 animate-spin text-teal-500 mb-4" />
            <p className="font-medium animate-pulse">Initializing AI...</p>
          </div>
        )}

        {status === "ready" && (
          <button
            onClick={toggleCamera}
            className="absolute bottom-4 right-4 z-20 p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white transition-all"
          >
            <RotateCcw className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;