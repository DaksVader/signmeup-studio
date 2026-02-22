import { useEffect, useRef, useState, useCallback } from "react";
import Header from "@/components/Header";
import ModeToggle from "@/components/ModeToggle";
import CameraFeed from "@/components/CameraFeed";
import SignHistory from "@/components/SignHistory";
import SpeechRecorder from "@/components/SpeechRecorder";
import HowItWorks from "@/components/HowItWorks";
// Import the pipeline so we can clear its memory
import { actionLstmPipeline } from "@/lib/actionLstmPipeline";

type Mode = "speech" | "sign-to-text";

export interface ChatMessage {
  id: string;
  text: string;
  source: "speech" | "sign";
  timestamp: Date;
}

const Index = () => {
  const [mode, setMode] = useState<Mode>("speech");
  const [currentSign, setCurrentSign] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const pauseTimeoutRef = useRef<number | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  
  const [speechHistory, setSpeechHistory] = useState<ChatMessage[]>([]);
  const [signHistory, setSignHistory] = useState<ChatMessage[]>([]);
  const [currentWord, setCurrentWord] = useState<string>("");
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    setCameraKey((k) => k + 1);
  }, [mode]);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) {
        window.clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSignDetected = useCallback((letter: string | null) => {
    if (isPaused) return;
    if (!letter) return;
    
    // Prevent spam: only update if it's different from the last sign 
    // or if the current word doesn't already end with this sign
    setCurrentWord(prev => {
      if (prev.endsWith(letter)) return prev;
      return prev + letter;
    });
    setCurrentSign(letter);
  }, [isPaused]);

  const handleSubmitWord = useCallback(() => {
    if (!currentWord.trim()) return;
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: currentWord.trim(),
      source: "sign",
      timestamp: new Date(),
    };
    
    setSignHistory(prev => [...prev, newMessage]);
    setCurrentWord("");
    setCurrentSign(null);
    
    // 🔥 Reset AI Memory so it doesn't spam the old word
    actionLstmPipeline.clearBuffer();

    // Reduced pause to 400ms so it feels snappy, not "frozen"
    setIsPaused(true);
    if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = window.setTimeout(() => {
      setIsPaused(false);
      pauseTimeoutRef.current = null;
    }, 400); 
  }, [currentWord]);

  const handleClearCurrentWord = useCallback(() => {
    setCurrentWord("");
    setCurrentSign(null);
    
    // 🔥 Reset AI Memory immediately
    actionLstmPipeline.clearBuffer();

    setIsPaused(true);
    if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = window.setTimeout(() => {
      setIsPaused(false);
      pauseTimeoutRef.current = null;
    }, 400);
  }, []);

  const handleSpeechMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: text.trim(),
      source: "speech",
      timestamp: new Date(),
    };
    setSpeechHistory(prev => [...prev, newMessage]);
  }, []);

  const handleDeleteSpeechHistory = useCallback(() => setSpeechHistory([]), []);
  const handleDeleteSignHistory = useCallback(() => setSignHistory([]), []);

  return (
    <div className="min-h-screen bg-background">
      <Header modelsLoaded={modelsLoaded} />
      
      <main className="container pb-8 px-4">
        <div className="flex justify-center mb-6 md:mb-8">
          <ModeToggle mode={mode} onModeChange={setMode} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          {mode === "sign-to-text" && (
            <>
              <CameraFeed 
                key={cameraKey}
                isActive={true} 
                isPaused={isPaused}
                onSignDetected={handleSignDetected}
                currentWord={currentWord}
                onModelsLoaded={() => setModelsLoaded(true)}
              />
              <SignHistory 
                currentSign={currentSign}
                currentWord={currentWord}
                signHistory={signHistory}
                onClearCurrentWord={handleClearCurrentWord}
                onSubmitWord={handleSubmitWord}
                onDeleteHistory={handleDeleteSignHistory}
              />
            </>
          )}
          
          {mode === "speech" && (
            <SpeechRecorder 
              speechHistory={speechHistory}
              onSpeechMessage={handleSpeechMessage}
              onDeleteHistory={handleDeleteSpeechHistory}
            />
          )}
        </div>

        <HowItWorks />
      </main>

      <footer className="py-6 text-center text-muted-foreground text-sm border-t border-border/50">
        <p>© 2025 SignSpeak. Breaking barriers through technology.</p>
      </footer>
    </div>
  );
};

export default Index;