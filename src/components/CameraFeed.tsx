import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCcw, Zap, ZapOff, Activity, ShieldAlert } from "lucide-react";
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
  const [debugPrediction, setDebugPrediction] = useState<{action: string, conf: number} | null>(null);

  const processingLocked = useRef(false);
  const smootherRef = useRef(new LandmarkSmoother(1662));

  // HARD LOGIC FIX: Check if fingers are physically extended
  const checkFingerSanity = (handLandmarks: any[], action: string): boolean => {
    if (!handLandmarks) return false;
    
    // MediaPipe Hand Indices: 8=Index, 12=Middle, 16=Ring, 20=Pinky (all Tips)
    // Compare Tip Y to Pip (joint) Y. Lower Y = Higher in screen.
    const isMiddleUp = handLandmarks[12].y < handLandmarks[10].y;
    const isRingUp = handLandmarks[16].y < handLandmarks[14].y;

    if (action === "iloveyou") {
      // "I Love You" REQUIRES middle and ring to be DOWN
      return !isMiddleUp && !isRingUp;
    }
    if (action === "hello") {
      // "Hello" REQUIRES middle and ring to be UP
      return isMiddleUp && isRingUp;
    }
    return true;
  };

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
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
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

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.save();
        if (facingMode === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (holisticDetector.ready && !isPaused && !processingLocked.current) {
          const isEnv = facingMode === "environment";
          const features = await holisticDetector.extractFeatures(video, isEnv);
          const results = (holisticDetector as any).lastResults;
          
          if (results) {
            const win = window as any;
            if (results.leftHandLandmarks) {
              win.drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });
              win.drawLandmarks(ctx, results.leftHandLandmarks, { color: "#FFFFFF", lineWidth: 1, radius: 2 });
            }
            if (results.rightHandLandmarks) {
              win.drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });
              win.drawLandmarks(ctx, results.rightHandLandmarks, { color: "#FFFFFF", lineWidth: 1, radius: 2 });
            }
          }
          
          if (features && (results?.leftHandLandmarks || results?.rightHandLandmarks)) {
            const smoothedFeatures = smootherRef.current.smooth(features);
            actionLstmPipeline.pushFrame(smoothedFeatures);
            
            const prediction = await actionLstmPipeline.predict();
            
            if (prediction) {
              const activeHand = results.rightHandLandmarks || results.leftHandLandmarks;
              // APPLY SANITY CHECK
              const isValid = checkFingerSanity(activeHand, prediction.action);

              if (isValid) {
                onSignDetected(prediction.action);
                setDebugPrediction({ action: prediction.action, conf: prediction.confidence });
                setTimeout(() => setDebugPrediction(null), 1000);
              } else {
                console.log(`Blocked false positive: ${prediction.action}`);
              }
            }
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
    holisticDetector.reset(); 
    await new Promise(r => setTimeout(r, 500));
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
        
        {status === "ready" && (
          <div className="absolute top-6 left-6 p-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 text-white text-xs flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-400" />
            <span>AI Guard: <span className="text-teal-400 font-bold">ACTIVE</span></span>
          </div>
        )}

        <AnimatePresence>
          {debugPrediction && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute top-20 left-6 p-4 bg-teal-500 rounded-2xl text-white font-bold shadow-lg">
              Detected: {debugPrediction.action.toUpperCase()} ({Math.round(debugPrediction.conf * 100)}%)
            </motion.div>
          )}

          {(status === "loading" || isSwitching) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
              <Loader2 className="w-12 h-12 animate-spin text-teal-500 mb-4" />
              <p className="text-white font-medium">Initializing Vision Engine...</p>
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
            <button onClick={toggleCamera} className="p-5 bg-white/10 hover:bg-white/20 backdrop-blur-2xl rounded-full text-white border border-white/20 transition-colors">
              <RotateCcw className="w-7 h-7" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;