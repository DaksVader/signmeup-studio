import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Trash2, Hand, Volume2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/pages/Index";

interface SignHistoryProps {
  currentSign?: string | null;
  currentWord?: string;
  signHistory: ChatMessage[];
  onClearCurrentWord: () => void;
  onSubmitWord: () => void;
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
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
          🤟 Sign
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

const SignHistory = ({ 
  currentSign, 
  currentWord = "",
  signHistory,
  onClearCurrentWord,
  onSubmitWord,
  onDeleteHistory
}: SignHistoryProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="glass-card-elevated h-full flex flex-col"
    >
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Hand className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          </div>
          {currentSign && currentSign !== " " && (
            <motion.span
              key={currentSign}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-sm font-bold"
            >
              {currentSign}
            </motion.span>
          )}
        </div>
        
        <div className="bg-background rounded-lg border-2 border-primary/30 p-4 min-h-[60px] flex items-center justify-center">
          {currentWord ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-2xl md:text-3xl font-display font-bold text-foreground text-center tracking-wider"
            >
              {currentWord}
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="inline-block w-0.5 h-6 bg-primary ml-1 align-middle"
              />
            </motion.p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Start signing to form a word...
            </p>
          )}
        </div>

        {currentWord && (
          <div className="flex justify-center gap-3 mt-3">
            <Button
              onClick={onSubmitWord}
              variant="default"
              size="lg"
              className="bg-primary hover:bg-primary/90"
            >
              <Send className="w-4 h-4 mr-2" />
              Submit to History
            </Button>
            <Button
              onClick={onClearCurrentWord}
              variant="outline"
              size="lg"
              className="text-destructive hover:text-destructive border-destructive/30"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Sign Mode Chat History */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">
              Sign History
            </h2>
          </div>
          {signHistory.length > 0 && (
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
            {signHistory.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex items-center justify-center text-muted-foreground text-sm"
              >
                Signs will appear here when you complete a word
              </motion.div>
            ) : (
              <div className="space-y-2">
                {signHistory.map((msg) => (
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

export default SignHistory;
