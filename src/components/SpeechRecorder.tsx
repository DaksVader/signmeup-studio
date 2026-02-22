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
  const silenceTimerRef = useRef<any>(null);
  // NEW: Ref to track what has already been committed to prevent doubling
  const lastProcessedTextRef = useRef(""); 

  const handleSpeak = (text: string) => {
    const synth = window.speechSynthesis;
    if (synth) {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      synth.speak(utterance);
    }
  };

  const formatSpeechText = (raw: string) => {
    let text = raw.trim();
    if (!text) return "";
    
    // Remove repeated phrases (e.g., "hello hello hello")
    const words = text.split(/\s+/);
    const uniqueWords = words.filter((word, index) => word.toLowerCase() !== words[index - 1]?.toLowerCase());
    text = uniqueWords.join(" ");

    text = text.replace(/\bi\b/g, "I").replace(/\bi'm\b/gi, "I'm");
    text = text.charAt(0).toUpperCase() + text.slice(1);

    const questionStarters = ["who", "what", "where", "when", "why", "how", "is", "are", "can", "do", "did", "will", "could", "should", "would"];
    const exclamationWords = ["wow", "hey", "hello", "great", "awesome", "stop"];
    
    const firstWord = text.split(/\s+/)[0].toLowerCase();
    const hasEndingPunctuation = /[.!?]$/.test(text);

    if (!hasEndingPunctuation) {
      if (questionStarters.includes(firstWord)) text += "?";
      else if (exclamationWords.includes(firstWord)) text += "!";
      else text += ".";
    }
    return text;
  };

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    setError(null);
    lastProcessedTextRef.current = "";
    setInterimText("");
    
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
      };

      recognition.onresult = (event: any) => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);

        let finalPart = "";
        let interimPart = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalPart += transcript;
          } else {
            interimPart += transcript;
          }
        }
        
        // UPDATE: Reset the UI state with only the fresh text from this session
        const currentText = (finalPart || interimPart).trim();
        if (currentText) {
            setInterimText(currentText);
            lastProcessedTextRef.current = currentText;
        }
        
        // Auto-stop after 2 seconds of silence (standard for mobile)
        silenceTimerRef.current = window.setTimeout(() => stopRecording(), 2000);
      };

      recognition.onend = () => {
        setIsRecording(false);
        const textToSave = lastProcessedTextRef.current.trim();
        
        if (textToSave) {
          onSpeechMessage(formatSpeechText(textToSave));
        }
        setInterimText("");
        lastProcessedTextRef.current = "";
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError("Mic access failed");
      setIsRecording(false);
    }
  }, [onSpeechMessage, stopRecording]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  return (
    <div className="h-full flex flex-col items-center bg-background">
      <div className="w-full p-8 border-b text-center flex flex-col items-center bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <h2 className="font-bold text-xl mb-6 text-foreground">Speech Mode</h2>
        
        <button
          onClick={() => isRecording ? stopRecording() : startRecording()}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 ${
            isRecording ? "bg-red-500 animate-pulse" : "bg-teal-700 hover:bg-teal-600"
          }`}
        >
          {isRecording ? <MicOff size={40} className="text-white" /> : <Mic size={40} className="text-white" />}
        </button>
        
        <p className="mt-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
          {isRecording ? "Listening... History updates after 2s of silence" : "Tap to start recording"}
        </p>
        
        <AnimatePresence>
            {interimText && (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-5 bg-teal-50/50 rounded-2xl border border-teal-100 max-w-[95%] shadow-sm"
            >
                <p className="text-base font-medium italic text-teal-900 leading-relaxed">
                "{interimText}"
                </p>
            </motion.div>
            )}
        </AnimatePresence>
        {error && <p className="text-destructive text-xs mt-2 font-bold bg-red-50 p-2 rounded">{error}</p>}
      </div>

      <div className="flex-1 w-full overflow-y-auto p-4 space-y-4 pb-20">
        <div className="flex justify-between items-center px-2 mb-2">
          <span className="text-sm font-bold flex items-center gap-2 text-slate-600">
            <MessageSquare size={16} className="text-teal-700"/> Speech History
          </span>
          {speechHistory.length > 0 && (
            <Trash2 
              size={18} 
              className="text-muted-foreground cursor-pointer hover:text-destructive transition-colors" 
              onClick={() => setShowDeleteConfirm(true)} 
            />
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl mb-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-red-800">Clear all speech history?</p>
                <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={() => { onDeleteHistory(); setShowDeleteConfirm(false); }}>Yes, Clear</Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
            </div>
        )}

        <div className="space-y-3">
          {speechHistory.map((msg) => (
            <div key={msg.id} className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-border/60 shadow-sm hover:shadow-md transition-all">
              <div className="flex-1 pr-4">
                 <div className="flex items-center gap-2 mb-1">
                   <p className="text-[10px] font-black text-teal-700 uppercase tracking-tighter">Voice Entry</p>
                   <span className="text-[10px] font-medium text-slate-400">
                     {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                 </div>
                 <p className="text-sm font-medium text-slate-700">{msg.text}</p>
              </div>
              <Button 
                size="icon" 
                variant="secondary" 
                className="h-10 w-10 shrink-0 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-700 hover:text-white transition-all shadow-sm"
                onClick={() => handleSpeak(msg.text)}
              >
                <Volume2 size={20} />
              </Button>
            </div>
          ))}
          {speechHistory.length === 0 && (
            <div className="text-center py-20 opacity-40 flex flex-col items-center gap-3">
              <Mic size={40} />
              <p className="text-sm font-bold uppercase tracking-widest">No history recorded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeechRecorder;