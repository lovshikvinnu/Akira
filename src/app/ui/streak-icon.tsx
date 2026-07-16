import { Dumbbell, BookOpen, Moon, Cpu, Sparkles } from "lucide-react";
import type { HabitStreak } from "@/akira-os";

export function StreakIcon({ icon, className }: { icon: HabitStreak["icon"]; className?: string }) {
  const map = { dumbbell: Dumbbell, cpu: Cpu, book: BookOpen, sparkles: Sparkles, moon: Moon };
  const Icon = map[icon];
  return <Icon className={className} />;
}
