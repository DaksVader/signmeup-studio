import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, MessageSquare, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/pages/Index";

interface SpeechRecorderProps {
  speechHistory: ChatMessage[];
  onSpeechMessage: (text: string) => void;
  onDeleteHistory: () => void;
}

const speakText = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }
};

const MessageItem = ({ msg }: { msg: ChatMessage }) => (
  <motion.div
    key={msg.id}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="group flex items-start gap-2 p-3 bg-secondary/50 rounded-lg"
  >
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500">
          🎤 Speech
        </span>
        <span className="text-xs text-muted-foreground">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-foreground">{msg.text}</p>
    </div>
    <Button
      variant="ghost"
      size="icon"
      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
      onClick={() => speakText(msg.text)}
    >
      <Volume2 className="w-4 h-4 text-muted-foreground hover:text-primary" />
    </Button>
  </motion.div>
);

const SpeechRecorder = ({ speechHistory, onSpeechMessage, onDeleteHistory }: SpeechRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const fullTranscriptRef = useRef("");
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to commit current text to history
  const commitToHistory = useCallback(() => {
    const finalSentence = fullTranscriptRef.current.trim();
    if (finalSentence) {
      onSpeechMessage(finalSentence);
      fullTranscriptRef.current = "";
      setInterimText("");
    }
  }, [onSpeechMessage]);

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    commitToHistory();
    setIsRecording(false);
  }, [commitToHistory]);

  const startRecording = useCallback(() => {
    setError(null);
    fullTranscriptRef.current = "";
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: any) => {
      // Reset silence timer every time a result comes in
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      let currentInterim = "";
      let newlyFinalized = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newlyFinalized += transcript;
        } else {
          currentInterim += transcript;
        }
      }

      if (newlyFinalized) fullTranscriptRef.current += " " + newlyFinalized;
      setInterimText((fullTranscriptRef.current + " " + currentInterim).trim());

      // Start a 3-second timer. If no speech, finalize the current sentence.
      silenceTimerRef.current = setTimeout(() => {
        commitToHistory();
      }, 3000); 
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        setError(`Error: ${event.error}`);
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      if (isRecording) recognition.start(); // Auto-restart if we haven't manually stopped
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isRecording, commitToHistory]);

  const toggleRecording = useCallback(() => {
    isRecording ? stopRecording() : startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card-elevated h-full flex flex-col lg:col-span-2"
    >
      <div className="p-6 border-b border-border/50">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <h2 className="font-display font-semibold text-foreground text-lg">Speech Mode</h2>
          
          <motion.button
            onClick={toggleRecording}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording ? "bg-destructive text-white" : "bg-primary text-white"
            }`}
          >
            {isRecording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
            {isRecording && (
              <motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute inset-0 rounded-full border-4 border-destructive"
              />
            )}
          </motion.button>

          <p className="text-sm text-muted-foreground">
            {isRecording ? "Listening... History updates after 3s of silence" : "Tap to speak"}
          </p>

          <AnimatePresence>
            {interimText && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-background/80 rounded-lg border border-primary/20 p-4"
              >
                <p className="text-foreground italic">{interimText}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Speech History</h2>
          </div>
          {speechHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onDeleteHistory}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {speechHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm italic">
                No messages recorded
              </div>
            ) : (
              <div className="space-y-2">
                {speechHistory.map((msg) => (
                  <MessageItem key={msg.id} msg={msg} />
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default SpeechRecorder;