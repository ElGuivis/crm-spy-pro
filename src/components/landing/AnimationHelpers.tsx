import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

export const AnimatedSection = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string; delay?: number }>(
  ({ children, className = "", delay = 0 }, _forwardedRef) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-80px" });
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.7, delay, ease: [0.25, 0.4, 0.25, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
);
AnimatedSection.displayName = "AnimatedSection";

export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};
