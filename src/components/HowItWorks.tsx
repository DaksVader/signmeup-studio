import { motion } from "framer-motion";
import { Hand, Brain, MessageCircle, Volume2 } from "lucide-react";

const steps = [
  {
    icon: Hand,
    title: "Capture Signs",
    description: "Our camera detects and tracks your hand movements in real-time using 21-point skeletal tracking.",
  },
  {
    icon: Brain,
    title: "AI Processing",
    description: "Advanced machine learning analyzes hand positions and gestures to recognize sign language patterns.",
  },
  {
    icon: MessageCircle,
    title: "Translation",
    description: "Detected signs are instantly converted into text, creating seamless communication.",
  },
  {
    icon: Volume2,
    title: "Speech Output",
    description: "Text can be spoken aloud using text-to-speech technology for hearing users.",
  },
];

const HowItWorks = () => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card p-6 md:p-8"
    >
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6 text-center">
        How It Works
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
            className="flex flex-col items-center text-center p-4"
          >
            <div className="relative mb-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <step.icon className="w-7 h-7 text-primary" />
              </div>
              <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-2">
              {step.title}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {step.description}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.9 }}
        className="mt-8 p-4 bg-secondary/50 rounded-xl"
      >
        <p className="text-muted-foreground text-sm text-center">
          <strong className="text-foreground">Tip:</strong> For best results, ensure good lighting and position your hands clearly in frame. 
          The system supports common ASL gestures and is continuously learning.
        </p>
      </motion.div>
    </motion.section>
  );
};

export default HowItWorks;
