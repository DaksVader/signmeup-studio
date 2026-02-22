import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, MessageSquare, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/pages/Index";

interface SpeechRecorderProps {
  speechHistory: ChatMessage[];
  onSpeechMessage: (text: string) => void;
  onDeleteHistory: () => void;
}

// Text-to-Speech helper
const speakText = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }
};

// Message item with TTS support
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
      title="Speak this message"
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

  const startRecording = useCallback(() => {
    setError(null);
    
    // Check for Web Speech API support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      setInterimText("");
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        onSpeechMessage(final.trim());
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === 'not-allowed') {
        setError("Microphone access was denied. Please allow microphone access and try again.");
      } else if (event.error === 'no-speech') {
        setError("No speech detected. Please try again.");
      } else {
        setError(`Error: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onSpeechMessage]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterimText("");
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="glass-card-elevated h-full flex flex-col lg:col-span-2"
    >
      {/* Voice Recorder Section */}
      <div className="p-6 border-b border-border/50">
        <div className="flex flex-col items-center justify-center gap-4">
          <h2 className="font-display font-semibold text-foreground text-lg">
            Speech Mode
          </h2>
          
          <motion.button
            onClick={toggleRecording}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording 
                ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30" 
                : "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50"
            }`}
          >
            {isRecording ? (
              <>
                <MicOff className="w-10 h-10" />
                {/* Pulsing ring animation */}
                <motion.span
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 rounded-full border-4 border-destructive"
                />
              </>
            ) : (
              <Mic className="w-10 h-10" />
            )}
          </motion.button>

          <p className="text-sm text-muted-foreground text-center">
            {isRecording ? "Tap to stop recording" : "Tap to start recording"}
          </p>

          {/* Live Preview / Interim Text */}
          {interimText && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md bg-background rounded-lg border-2 border-primary/30 p-4"
            >
              <p className="text-sm text-muted-foreground mb-1">Listening...</p>
              <p className="text-foreground italic">{interimText}</p>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-destructive text-sm text-center max-w-md"
            >
              {error}
            </motion.div>
          )}
        </div>
      </div>

      {/* Speech History */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">
              Speech History
            </h2>
          </div>
          {speechHistory.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onDeleteHistory}
              className="text-muted-foreground hover:text-destructive"
              title="Delete all history"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 p-4 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {speechHistory.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex items-center justify-center text-muted-foreground text-sm"
              >
                Your spoken messages will appear here
              </motion.div>
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
