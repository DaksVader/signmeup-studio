import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCcw, Zap, ZapOff, Activity, ScanEye, CheckCircle2 } from "lucide-react";
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
  const [status, setStatus] = useState<"loading" | "calibrating" | "ready" | "error">("loading");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const [torch, setTorch] = useState(false);
  
  const [debugPrediction, setDebugPrediction] = useState<{action: string, conf: number} | null>(null);

  const processingLocked = useRef(false);
  const smootherRef = useRef(new LandmarkSmoother(1662));
  const stabilityBuffer = useRef<string[]>([]);

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
        video: { 
          facingMode: { ideal: facingMode }, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        }
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
            const drawUtils = win.drawConnectors && win.drawLandmarks;
            
            if (results.leftHandLandmarks) {
              win.drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });
              win.drawLandmarks(ctx, results.leftHandLandmarks, { color: "#FFFFFF", lineWidth: 1, radius: 2 });
            }
            if (results.rightHandLandmarks) {
              win.drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });
              win.drawLandmarks(ctx, results.rightHandLandmarks, { color: "#FFFFFF", lineWidth: 1, radius: 2 });
            }

            // CALIBRATION LOGIC
            const hand = results.leftHandLandmarks || results.rightHandLandmarks;
            if (status === "calibrating") {
                // Check if hand is in center 40% of screen to avoid lens warping
                const isInZone = hand && hand[0].x > 0.3 && hand[0].x < 0.7 && hand[0].y > 0.3 && hand[0].y < 0.7;
                if (isInZone) {
                    setCalibrationProgress(prev => {
                        if (prev >= 100) { setStatus("ready"); return 100; }
                        return prev + 2;
                    });
                } else {
                    setCalibrationProgress(prev => Math.max(0, prev - 2));
                }
            }
          }
          
          if (status === "ready" && features && (results?.leftHandLandmarks || results?.rightHandLandmarks)) {
            const smoothedFeatures = smootherRef.current.smooth(features);
            actionLstmPipeline.pushFrame(smoothedFeatures);
            const prediction = await actionLstmPipeline.predict();
            
            if (prediction) {
              // TEMPORAL STABILITY: Only trigger if we see the same sign 3 times in a row
              stabilityBuffer.current.push(prediction.action);
              if (stabilityBuffer.current.length > 3) stabilityBuffer.current.shift();
              
              const isStable = stabilityBuffer.current.every(v => v === prediction.action);

              if (isStable) {
                onSignDetected(prediction.action);
                setDebugPrediction({ action: prediction.action, conf: prediction.confidence });
                setTimeout(() => setDebugPrediction(null), 1200);
                stabilityBuffer.current = []; // Reset after trigger
              }
            }
          }
        }
        
        ctx.restore();
        renderFrameRef.current = requestAnimationFrame(loop);
      };
      renderFrameRef.current = requestAnimationFrame(loop);
    } catch (e) { setStatus("error"); }
  }, [facingMode, isPaused, status, onSignDetected, cleanup]);

  const toggleCamera = async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    cleanup();
    setTorch(false);
    setCalibrationProgress(0);
    setStatus("calibrating");
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
        setStatus("calibrating");
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
        
        {/* Progress & Target Box for Calibration */}
        <AnimatePresence>
            {status === "calibrating" && (
                <motion.div exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[2px] z-20">
                    <div className="w-48 h-64 border-2 border-dashed border-teal-400/60 rounded-3xl flex items-center justify-center relative">
                        <ScanEye className="text-teal-400 w-12 h-12 animate-pulse" />
                        <div className="absolute -bottom-10 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-teal-400" initial={{ width: 0 }} animate={{ width: `${calibrationProgress}%` }} />
                        </div>
                    </div>
                    <p className="text-white text-[10px] font-black uppercase tracking-tighter mt-14 bg-black/50 px-3 py-1 rounded-full">
                        Center your hand to calibrate mobile lens
                    </p>
                </motion.div>
            )}
        </AnimatePresence>

        {status === "ready" && (
          <div className="absolute top-6 left-6 p-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 text-white text-xs flex items-center gap-2 z-10">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>Lens Calibrated</span>
          </div>
        )}

        <AnimatePresence>
          {debugPrediction && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-20 left-6 p-4 bg-teal-500 rounded-2xl text-white font-bold shadow-lg z-30">
              {debugPrediction.action.toUpperCase()} ({Math.round(debugPrediction.conf * 100)}%)
            </motion.div>
          )}

          {(status === "loading" || isSwitching) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
              <Loader2 className="w-12 h-12 animate-spin text-teal-500 mb-4" />
              <p className="text-white font-medium">Powering up AI...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {status !== "loading" && !isSwitching && (
          <div className="absolute bottom-8 right-6 flex flex-col gap-4 z-30">
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