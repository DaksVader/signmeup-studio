import { motion } from "framer-motion";
import { Mic, Hand } from "lucide-react";

type Mode = "speech" | "sign-to-text";

interface ModeToggleProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

const ModeToggle = ({ mode, onModeChange }: ModeToggleProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="flex items-center justify-center p-1 bg-secondary rounded-xl"
    >
      <button
        onClick={() => onModeChange("speech")}
        className={mode === "speech" ? "mode-toggle-button-active" : "mode-toggle-button-inactive"}
      >
        <span className="flex items-center gap-2">
          <Mic className="w-4 h-4" />
          <span className="hidden sm:inline">Speech Mode</span>
          <span className="sm:hidden">Speech</span>
        </span>
      </button>
      <button
        onClick={() => onModeChange("sign-to-text")}
        className={mode === "sign-to-text" ? "mode-toggle-button-active" : "mode-toggle-button-inactive"}
      >
        <span className="flex items-center gap-2">
          <Hand className="w-4 h-4" />
          <span className="hidden sm:inline">Sign-to-Text</span>
          <span className="sm:hidden">Sign</span>
        </span>
      </button>
    </motion.div>
  );
};

export default ModeToggle;
