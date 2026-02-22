import { Hand } from "lucide-react";
import { motion } from "framer-motion";
import OfflineReadyBadge from "./OfflineReadyBadge";

const Header = ({ modelsLoaded }: { modelsLoaded?: boolean }) => {
  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full py-4 px-4 md:py-6"
    >
      <div className="container flex items-center justify-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Hand className="w-7 h-7 md:w-8 md:h-8 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Sign<span className="gradient-text">Speak</span>
        </h1>
        <OfflineReadyBadge modelsLoaded={modelsLoaded} />
      </div>
    </motion.header>
  );
};

export default Header;
