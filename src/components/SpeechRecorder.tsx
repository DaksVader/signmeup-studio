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

const SpeechRecorder = ({ speechHistory, onSpeechMessage, onDeleteHistory }: SpeechRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const silenceTimerRef = useRef<any>(null);

  // --- NATIVE WEB TTS (Replaces Capacitor) ---
  const handleSpeak = (text: string) => {
    const synth = window.speechSynthesis;
    if (synth) {
      synth.cancel(); // Stop current speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      synth.speak(utterance);
    }
  };

  // --- REFINED FORMATTING LOGIC ---
  const formatSpeechText = (raw: string) => {
    let text = raw.trim();
    if (!text) return "";

    // 1. Fix casing for "I" and "I'm"
    text = text.replace(/\bi\b/g, "I").replace(/\bi'm\b/gi, "I'm");

    // 2. Capitalize the very first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);

    // 3. Smart Punctuation
    const questionStarters = ["who", "what", "where", "when", "why", "how", "is", "are", "can", "do", "did", "will", "could", "should", "would"];
    const exclamationWords = ["wow", "hey", "hello", "great", "awesome", "stop"];
    
    const words = text.split(/\s+/);
    const firstWord = words[0].toLowerCase();
    const hasEndingPunctuation = /[.!?]$/.test(text);

    if (!hasEndingPunctuation) {
      if (questionStarters.includes(firstWord)) {
        text += "?";
      } else if (exclamationWords.includes(firstWord)) {
        text += "!";
      } else {
        text += ".";
      }
    }

    return text;
  };

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Recognition already stopped");
      }
    }
    
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    setError(null);
    finalTranscriptRef.current = ""; 
    
    try {
      const Win = window as any;
      const SpeechLib = Win.SpeechRecognition || Win.webkitSpeechRecognition;
      
      if (!SpeechLib) {
        setError("Speech not supported");
        return;
      }

      const recognition = new SpeechLib();
      recognition.continuous = true;
      recognition.interimResults = true; 
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        setInterimText("");
      };

      recognition.onresult = (event: any) => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);

        let currentFullText = "";
        let currentInterim = "";

        // Rebuilding from index 0 prevents the "Mobile Doubling" issue
        for (let i = 0; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            currentFullText += transcript;
          } else {
            currentInterim += transcript;
          }
        }
        
        // Store the stable part in the ref
        finalTranscriptRef.current = currentFullText;
        // Show both finalized and interim text in UI
        setInterimText((currentFullText + " " + currentInterim).trim());
        
        // Auto-stop after 2.5 seconds of silence
        silenceTimerRef.current = window.setTimeout(() => stopRecording(), 2500);
      };

      recognition.onend = () => {
        setIsRecording(false);
        const raw = (finalTranscriptRef.current || interimText).trim();
        
        if (raw) {
          const formatted = formatSpeechText(raw);
          onSpeechMessage(formatted);
        }
        setInterimText("");
        finalTranscriptRef.current = "";
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError("Mic access failed");
      setIsRecording(false);
    }
  }, [onSpeechMessage, stopRecording, interimText]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  return (
    <div className="h-full flex flex-col items-center bg-background">
      <div className="w-full p-8 border-b text-center flex flex-col items-center">
        <h2 className="font-bold text-xl mb-6 text-foreground">Speech Mode</h2>
        
        <button
          onClick={() => isRecording ? stopRecording() : startRecording()}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 ${
            isRecording ? "bg-red-500" : "bg-teal-700"
          }`}
        >
          {isRecording ? <MicOff size={40} className="text-white" /> : <Mic size={40} className="text-white" />}
        </button>
        
        <p className="mt-4 text-sm font-medium text-muted-foreground">
          {isRecording ? "Listening..." : "Tap to record"}
        </p>
        
        {interimText && (
          <div className="mt-4 p-4 bg-secondary/20 rounded-xl border border-border/50 max-w-[90%]">
            <p className="text-sm italic text-foreground/80 leading-relaxed">
              "{interimText}"
            </p>
          </div>
        )}
        {error && <p className="text-destructive text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 w-full overflow-y-auto p-4 space-y-4">
        <div className="flex justify-between items-center px-2 mb-2">
          <span className="text-sm font-bold flex items-center gap-2">
            <MessageSquare size={16} className="text-teal-700"/> Speech History
          </span>
          {speechHistory.length > 0 && !showDeleteConfirm && (
            <Trash2 
              size={18} 
              className="text-muted-foreground cursor-pointer active:text-destructive hover:text-red-500 transition-colors" 
              onClick={() => setShowDeleteConfirm(true)} 
            />
          )}
          {showDeleteConfirm && (
            <div className="flex gap-3 text-[10px] font-black items-center bg-red-50 px-3 py-1 rounded-full border border-red-100">
              <span className="text-red-600 cursor-pointer" onClick={() => { onDeleteHistory(); setShowDeleteConfirm(false); }}>CLEAR ALL</span>
              <span className="text-slate-400 cursor-pointer" onClick={() => setShowDeleteConfirm(false)}>CANCEL</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {speechHistory.map((msg) => (
            <div key={msg.id} className="flex items-center justify-between p-4 bg-secondary/10 rounded-2xl border border-border/40 shadow-sm transition-all hover:bg-secondary/20">
              <div className="flex-1 pr-4">
                 <div className="flex items-center gap-2 mb-1">
                   <p className="text-[9px] font-bold text-teal-700 uppercase">Voice Entry</p>
                   <span className="text-[8px] text-muted-foreground">
                     {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                 </div>
                 <p className="text-sm leading-relaxed text-foreground">{msg.text}</p>
              </div>
              <Button 
                size="icon" 
                variant="secondary" 
                className="h-10 w-10 shrink-0 rounded-full bg-teal-700/10 text-teal-700 hover:bg-teal-700 hover:text-white transition-all"
                onClick={() => handleSpeak(msg.text)}
              >
                <Volume2 size={20} />
              </Button>
            </div>
          ))}
          {speechHistory.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm italic">
              No recorded messages yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeechRecorder;